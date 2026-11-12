"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleDashed, Loader2, Plug, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { NETWORKS, type Network, type Route, type StudioSettings } from "@/lib/studio/types";
import { api, Btn, Card, formatDate, inputClass, Notice } from "./shared";

type Status = {
  settings: StudioSettings;
  openai: { configured: boolean; model: string };
  planner: { configured: boolean };
  storage: { kind: string; publicUrl: string | null };
  meta: {
    oauthAvailable: boolean;
    source: "oauth" | "env" | null;
    pageName: string | null;
    pageId: string | null;
    igUserId: string | null;
    igUsername: string | null;
    userName: string | null;
    connectedAt: string | null;
  };
  n8n: { publish: boolean; approval: boolean; signed: boolean };
  api: { apiKey: boolean; cron: boolean };
  carousel: { url: string };
};

const CALLBACK_MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  "connected=meta": { tone: "success", text: "Facebook / Instagram conectados correctamente." },
  "error=meta_not_configured": { tone: "error", text: "Faltan META_APP_ID y META_APP_SECRET en el servidor." },
  "error=meta_denied": { tone: "error", text: "Se canceló el permiso en Facebook." },
  "error=meta_state": { tone: "error", text: "La sesión de conexión expiró. Inténtalo otra vez." },
  "error=meta_no_pages": { tone: "error", text: "Tu usuario no administra ninguna página de Facebook." },
  "error=meta_exchange": { tone: "error", text: "Meta rechazó la conexión. Revisa la configuración de la app." },
};

function Dot({ ok }: { ok: boolean }) {
  return ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <CircleDashed className="h-4 w-4 shrink-0 text-muted" />;
}

export function ConnectionsPanel({ callback }: { callback: string | null }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(callback ? CALLBACK_MESSAGES[callback] ?? null : null);
  const [pages, setPages] = useState<Array<{ id: string; name: string; instagram: string | null }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/studio/connections"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (callback === "select=meta") {
      api<{ pages: typeof pages }>("/api/studio/connections/meta/select")
        .then((r) => setPages(r.pages))
        .catch((e: Error) => setError(e.message));
    }
  }, [load, callback]);

  async function choosePage(pageId: string) {
    setBusy(pageId);
    try {
      await api("/api/studio/connections/meta/select", { method: "POST", json: { pageId } });
      setPages([]);
      setMessage(CALLBACK_MESSAGES["connected=meta"]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("¿Desconectar Facebook / Instagram?")) return;
    await api("/api/studio/connections?provider=meta", { method: "DELETE" }).catch((e: Error) => setError(e.message));
    await load();
  }

  async function testN8n() {
    setBusy("n8n");
    try {
      const r = await api<{ ok: boolean; status?: number }>("/api/studio/connections/n8n", { method: "POST" });
      setMessage(r.ok ? { tone: "success", text: "n8n respondió correctamente al ping." } : { tone: "error", text: `n8n respondió ${r.status}` });
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings(next: StudioSettings) {
    setStatus((s) => (s ? { ...s, settings: next } : s));
    try {
      await api("/api/studio/settings", { method: "PUT", json: next });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!status) {
    return error ? <Notice tone="error">{error}</Notice> : <Loader2 className="mx-auto h-6 w-6 animate-spin text-cyan" />;
  }

  const { meta, settings } = status;
  const metaConnected = Boolean(meta.source);
  const base = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-5">
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {pages.length > 0 ? (
        <Card title="Elige la página a conectar" hint="Tu usuario administra varias páginas. Se publicará en la que elijas (y en su Instagram vinculado).">
          <div className="grid gap-2 sm:grid-cols-2">
            {pages.map((p) => (
              <Btn key={p.id} onClick={() => choosePage(p.id)} disabled={busy !== null} className="justify-between">
                <span>{p.name}</span>
                <span className="text-xs text-muted">{p.instagram ? `IG: ${p.instagram}` : "sin Instagram"}</span>
                {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </Btn>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Facebook + Instagram (directo)"
          hint="Conexión oficial con la API de Meta. Instagram debe ser cuenta profesional vinculada a la página."
          actions={
            metaConnected && meta.source === "oauth" ? (
              <Btn variant="danger" onClick={disconnect} className="px-2.5 py-1.5 text-xs">
                <Unplug className="h-3.5 w-3.5" /> Desconectar
              </Btn>
            ) : null
          }
        >
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Dot ok={Boolean(meta.pageId)} /> Página de Facebook: <strong className="font-medium">{meta.pageName || meta.pageId || "—"}</strong>
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={Boolean(meta.igUserId)} /> Instagram: <strong className="font-medium">{meta.igUsername ? `@${meta.igUsername}` : meta.igUserId || "—"}</strong>
            </li>
            {meta.source === "env" ? <li className="text-xs text-muted">Configurado con token en variables de entorno.</li> : null}
            {meta.connectedAt ? (
              <li className="text-xs text-muted">
                Conectado por {meta.userName} · {formatDate(meta.connectedAt)}
              </li>
            ) : null}
          </ul>
          <a
            href="/api/studio/connections/meta/start"
            aria-disabled={!meta.oauthAvailable}
            className={cn(
              "focus-ring mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-light",
              !meta.oauthAvailable && "pointer-events-none opacity-50",
            )}
          >
            <Plug className="h-4 w-4" /> {metaConnected ? "Reconectar / cambiar página" : "Conectar con Facebook"}
          </a>
          {!meta.oauthAvailable ? <p className="mt-2 text-[11px] text-muted">Configura META_APP_ID y META_APP_SECRET para conectar desde aquí.</p> : null}
        </Card>

        <Card
          title="n8n"
          hint="Para LinkedIn, TikTok, X o cualquier flujo propio. También puede avisar las aprobaciones por WhatsApp/email."
          actions={
            <Btn onClick={testN8n} disabled={!status.n8n.publish || busy !== null} className="px-2.5 py-1.5 text-xs">
              {busy === "n8n" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Probar
            </Btn>
          }
        >
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Dot ok={status.n8n.publish} /> Webhook de publicación (N8N_PUBLISH_WEBHOOK_URL)
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={status.n8n.approval} /> Webhook de aprobaciones (N8N_APPROVAL_WEBHOOK_URL)
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={status.n8n.signed} /> Firma HMAC (N8N_WEBHOOK_SECRET)
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={status.api.apiKey} /> API key para callbacks (STUDIO_API_KEY)
            </li>
          </ul>
        </Card>
      </div>

      <Card title="Ruta de publicación por red" hint="Elige si cada red se publica directo desde la app o a través de tu workflow de n8n.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NETWORKS.map((n) => (
            <label key={n.key} className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <span>{n.label}</span>
              <select
                value={n.direct ? settings.routes[n.key] ?? "direct" : "n8n"}
                disabled={!n.direct}
                onChange={(e) => saveSettings({ ...settings, routes: { ...settings.routes, [n.key as Network]: e.target.value as Route } })}
                className={cn(inputClass, "w-auto py-1 text-xs")}
              >
                {n.direct ? <option value="direct">Directo (API)</option> : null}
                <option value="n8n">Vía n8n</option>
              </select>
            </label>
          ))}
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
            <span>Modo por defecto (API / Carrusel)</span>
            <select
              value={settings.defaultMode}
              onChange={(e) => saveSettings({ ...settings, defaultMode: e.target.value as StudioSettings["defaultMode"] })}
              className={cn(inputClass, "w-auto py-1 text-xs")}
            >
              <option value="approval">Con aprobación</option>
              <option value="direct">Directo</option>
            </select>
          </label>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Motores de iA y almacenamiento">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Dot ok={status.openai.configured} /> Generador de imágenes OpenAI · <code className="text-xs text-cyan">{status.openai.model}</code>
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={status.planner.configured} /> Planificador de carruseles (Claude)
            </li>
            <li className="flex items-center gap-2">
              <Dot ok /> Almacenamiento: {status.storage.kind === "supabase" ? "Supabase Storage" : "Disco del servidor"}
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={Boolean(status.storage.publicUrl)} /> URL pública (STUDIO_PUBLIC_URL): {status.storage.publicUrl ?? "se usa el dominio actual"}
            </li>
            <li className="flex items-center gap-2">
              <Dot ok={status.api.cron} /> Programación automática (CRON_SECRET)
            </li>
          </ul>
        </Card>

        <Card title="Integración con Carrusel Studio y Dashboard" hint="Endpoints para conectar otras apps (Bearer STUDIO_API_KEY).">
          <ul className="space-y-1.5 break-all font-mono text-[11px] text-muted">
            <li>
              <span className="text-cyan">POST</span> {base}/api/studio/posts <span className="font-sans">— crear publicación</span>
            </li>
            <li>
              <span className="text-cyan">POST</span> {base}/api/studio/generate <span className="font-sans">— generar imágenes</span>
            </li>
            <li>
              <span className="text-cyan">POST</span> {base}/api/studio/posts/:id/approve <span className="font-sans">— aprobar</span>
            </li>
            <li>
              <span className="text-cyan">POST</span> {base}/api/studio/posts/:id/results <span className="font-sans">— callback de n8n</span>
            </li>
            <li>
              <span className="text-cyan">GET</span> {base}/api/studio/cron <span className="font-sans">— publicar programados</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted">
            Carrusel Studio: <a className="text-cyan hover:underline" href={status.carousel.url} target="_blank" rel="noreferrer">{status.carousel.url}</a> recibe las imágenes por{" "}
            <code>?importar=</code> y las devuelve al enlace firmado. Ver <code>docs/studio.md</code>.
          </p>
        </Card>
      </div>
    </div>
  );
}
