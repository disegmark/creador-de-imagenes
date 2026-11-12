"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Layers, Loader2, RefreshCw, Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  api,
  Btn,
  Card,
  formatDate,
  inputClass,
  NETWORK_OPTIONS,
  NetworkPicker,
  Notice,
  STATUS_LABEL,
  STATUS_STYLE,
  type ClientPost,
  type Network,
  type PostStatus,
} from "./shared";

type Filter = "pending" | "scheduled" | "published" | "errors" | "drafts" | "all";

const FILTERS: Array<{ key: Filter; label: string; match: (p: ClientPost) => boolean }> = [
  { key: "pending", label: "Por aprobar", match: (p) => p.status === "pending_approval" },
  { key: "scheduled", label: "Programados / en curso", match: (p) => p.status === "approved" || p.status === "publishing" || p.status === "sent" },
  { key: "published", label: "Publicados", match: (p) => p.status === "published" },
  { key: "errors", label: "Con error", match: (p) => p.status === "failed" || p.status === "partial" },
  { key: "drafts", label: "Borradores", match: (p) => p.status === "draft" || p.status === "rejected" },
  { key: "all", label: "Todos", match: () => true },
];

const networkLabel = (n: Network) => NETWORK_OPTIONS.find((x) => x.key === n)?.label ?? n;
const EDITABLE: PostStatus[] = ["draft", "pending_approval", "approved", "rejected", "failed", "partial"];

export function QueuePanel({ refreshKey, focusId }: { refreshKey: number; focusId?: string | null }) {
  const [posts, setPosts] = useState<ClientPost[]>([]);
  const [filter, setFilter] = useState<Filter>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { posts } = await api<{ posts: ClientPost[] }>("/api/studio/posts");
      setPosts(posts);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carga inicial y cada vez que el panel Crear publica algo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!focusId || posts.length === 0) return;
    const post = posts.find((p) => p.id === focusId);
    const match = post ? FILTERS.find((f) => f.key !== "all" && f.match(post)) : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) setFilter(match.key);
  }, [focusId, posts]);

  const replace = (post: ClientPost) => setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, ...post } : p)));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, posts.filter(f.match).length])) as Record<Filter, number>;
  const visible = posts.filter(FILTERS.find((f) => f.key === filter)!.match);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "focus-ring rounded-full border px-3 py-1.5 text-xs font-medium",
              filter === f.key ? "border-cyan/60 bg-primary/15 text-cyan" : "border-border text-muted hover:text-foreground",
            )}
          >
            {f.label} <span className="ml-1 opacity-70">{counts[f.key]}</span>
          </button>
        ))}
        <Btn onClick={load} className="ml-auto px-2.5 py-1.5 text-xs" aria-label="Actualizar">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Actualizar
        </Btn>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {!loading && visible.length === 0 ? <Notice>No hay publicaciones en esta lista.</Notice> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((post) => (
          <PostCard key={post.id} post={post} highlighted={post.id === focusId} onChange={replace} onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))} />
        ))}
      </div>
    </div>
  );
}

function PostCard({
  post,
  highlighted,
  onChange,
  onDelete,
}: {
  post: ClientPost;
  highlighted: boolean;
  onChange: (p: ClientPost) => void;
  onDelete: (id: string) => void;
}) {
  const [caption, setCaption] = useState(post.caption);
  const [networks, setNetworks] = useState<Network[]>(post.networks);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const editable = EDITABLE.includes(post.status);
  // "Publicando" por más de 10 min = proceso cortado; se puede retomar.
  const [now] = useState(() => Date.now());
  const stale = post.status === "publishing" && now - new Date(post.updatedAt).getTime() > 10 * 60 * 1000;
  const dirty = caption !== post.caption || networks.join() !== post.networks.join();

  async function act(kind: string, fn: () => Promise<{ post?: ClientPost }>) {
    setBusy(kind);
    setError("");
    try {
      const { post: updated } = await fn();
      if (updated) onChange(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveIfDirty() {
    if (dirty) await api(`/api/studio/posts/${post.id}`, { method: "PATCH", json: { caption, networks } });
  }

  return (
    <Card className={cn(highlighted && "ring-2 ring-cyan/60")}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("rounded-full border px-2.5 py-0.5 font-medium", STATUS_STYLE[post.status])}>{STATUS_LABEL[post.status]}</span>
        <span className="text-muted">
          {post.media.length > 1 ? `Carrusel · ${post.media.length} láminas` : "Imagen"} · {post.format}
        </span>
        <span className="text-muted">· {post.source === "carrusel" ? "Desde Carrusel Studio" : post.source === "api" ? "Vía API / n8n" : "Studio"}</span>
        <span className="ml-auto text-muted">{formatDate(post.createdAt)}</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {post.media.map((m, i) => (
          <a key={`${m.id}-${i}`} href={m.url} target="_blank" rel="noreferrer" className="focus-ring w-24 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.title || `Lámina ${i + 1}`} className="aspect-[4/5] w-full rounded-lg object-cover" loading="lazy" />
          </a>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {editable ? (
          <>
            <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} className={cn(inputClass, "resize-y text-xs")} aria-label="Caption" />
            <NetworkPicker value={networks} onChange={setNetworks} />
          </>
        ) : (
          <>
            <p className="whitespace-pre-line text-sm text-foreground/90">{post.caption || <span className="text-muted">Sin texto</span>}</p>
            <p className="text-xs text-muted">{post.networks.map(networkLabel).join(" · ")}</p>
          </>
        )}

        {post.scheduledAt ? <p className="text-xs text-cyan">Programado para {formatDate(post.scheduledAt)}</p> : null}
        {post.note ? <p className="text-xs text-muted">Nota: {post.note}</p> : null}

        {post.results.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {post.results.map((r) => (
              <li key={r.network} className="flex flex-wrap items-center gap-2">
                <span className={r.ok ? "text-success" : r.pending ? "text-sign-amber" : "text-sign-signal"}>{r.ok ? "✓" : r.pending ? "…" : "✗"}</span>
                <span className="font-medium">{networkLabel(r.network)}</span>
                <span className="text-muted">({r.route === "n8n" ? "vía n8n" : "directo"})</span>
                {r.permalink ? (
                  <a href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan hover:underline">
                    Ver <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
                {r.pending ? <span className="text-sign-amber">esperando confirmación{r.error ? ` · ${r.error}` : ""}</span> : r.error ? <span className="text-sign-signal">{r.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className="flex flex-wrap gap-2">
          {post.status === "pending_approval" ? (
            <>
              <Btn
                variant="primary"
                disabled={busy !== null}
                onClick={() =>
                  act("approve", async () => {
                    await saveIfDirty();
                    return api(`/api/studio/posts/${post.id}/approve`, { method: "POST", json: {} });
                  })
                }
              >
                {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar
              </Btn>
              <Btn
                variant="danger"
                disabled={busy !== null}
                onClick={() => {
                  const note = window.prompt("Motivo del rechazo (opcional)") ?? undefined;
                  void act("reject", () => api(`/api/studio/posts/${post.id}/reject`, { method: "POST", json: { note } }));
                }}
              >
                <X className="h-4 w-4" /> Rechazar
              </Btn>
            </>
          ) : null}

          {["draft", "approved", "failed", "partial", "rejected"].includes(post.status) || stale ? (
            <Btn
              variant={post.status === "draft" ? "primary" : "ghost"}
              disabled={busy !== null || networks.length === 0}
              onClick={() =>
                act("publish", async () => {
                  await saveIfDirty();
                  return api(`/api/studio/posts/${post.id}/publish`, { method: "POST" });
                })
              }
            >
              {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {post.status === "failed" || post.status === "partial" || stale ? "Reintentar" : "Publicar ahora"}
            </Btn>
          ) : null}

          {editable && dirty && post.status !== "pending_approval" ? (
            <Btn disabled={busy !== null} onClick={() => act("save", () => api(`/api/studio/posts/${post.id}`, { method: "PATCH", json: { caption, networks } }))}>
              Guardar cambios
            </Btn>
          ) : null}

          {post.status === "draft" ? (
            <Btn
              disabled={busy !== null}
              onClick={() => {
                // Enlace nuevo (24 h) pedido en el momento: no se guarda en la lista.
                const tab = window.open("about:blank", "_blank");
                setBusy("carousel");
                api<{ openUrl: string }>(`/api/studio/posts/${post.id}/carousel`, { method: "POST" })
                  .then(({ openUrl }) => {
                    if (tab) tab.location.href = openUrl;
                  })
                  .catch((e: Error) => {
                    tab?.close();
                    setError(e.message);
                  })
                  .finally(() => setBusy(null));
              }}
            >
              <Layers className="h-4 w-4" /> Carrusel Studio
            </Btn>
          ) : null}

          <Btn
            className="ml-auto px-2.5"
            disabled={busy !== null || (post.status === "publishing" && !stale)}
            aria-label="Eliminar"
            onClick={() => {
              if (!window.confirm("¿Eliminar esta publicación de la cola? (No borra lo ya publicado en redes)")) return;
              setBusy("delete");
              api(`/api/studio/posts/${post.id}`, { method: "DELETE" })
                .then(() => onDelete(post.id))
                .catch((e: Error) => setError(e.message))
                .finally(() => setBusy(null));
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Btn>
        </div>
      </div>
    </Card>
  );
}
