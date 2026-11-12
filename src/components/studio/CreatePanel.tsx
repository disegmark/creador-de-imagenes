"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, ImagePlus, Layers, Loader2, Send, Sparkles, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AspectFormat } from "@/lib/studio/types";
import { api, Btn, Card, Field, inputClass, localToIso, NetworkPicker, Notice, type ClientPost, type MediaItem, type Network } from "./shared";

type Mode = "single" | "carousel";
type Quality = "low" | "medium" | "high";
type PublishChoice = "approval" | "direct" | "schedule";
type SlideDraft = { title: string; text: string; imagePrompt: string };

const FORMATS: Array<{ key: AspectFormat; label: string }> = [
  { key: "4:5", label: "4:5 · Vertical (feed)" },
  { key: "1:1", label: "1:1 · Cuadrado" },
  { key: "9:16", label: "9:16 · Historias / Reels" },
  { key: "16:9", label: "16:9 · Horizontal" },
];

const STYLE_PRESETS = [
  { label: "Fotografía de producto", value: "Professional product photography, soft studio lighting, clean background, high detail" },
  { label: "Lifestyle", value: "Natural lifestyle photography, warm daylight, authentic people, shallow depth of field" },
  { label: "Ilustración flat", value: "Modern flat vector illustration, bold shapes, limited palette, generous negative space" },
  { label: "3D minimalista", value: "Minimal 3D render, soft shadows, pastel palette, smooth materials" },
  { label: "Tecnológico", value: "Dark futuristic tech aesthetic, deep navy background, cyan neon accents, subtle glow" },
];

const QUALITY_HINT: Record<Quality, string> = {
  low: "Rápido y económico — ideal para bocetos",
  medium: "Equilibrio calidad / costo",
  high: "Máxima calidad — más lento y costoso",
};

export function CreatePanel({ onPublished }: { onPublished: (post: ClientPost) => void }) {
  const [mode, setMode] = useState<Mode>("carousel");
  const [format, setFormat] = useState<AspectFormat>("4:5");
  const [quality, setQuality] = useState<Quality>("medium");
  const [style, setStyle] = useState("");
  const [references, setReferences] = useState<File[]>([]);

  // Imagen suelta
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(2);

  // Carrusel
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [brand, setBrand] = useState("");
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  // Lámina → imagen generada, y láminas que fallaron (para reintentar solo esas).
  const [slideMedia, setSlideMedia] = useState<Record<number, string>>({});
  const [failedSlides, setFailedSlides] = useState<number[]>([]);

  // Resultado
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [networks, setNetworks] = useState<Network[]>(["instagram"]);
  const [publishChoice, setPublishChoice] = useState<PublishChoice>("approval");
  const [scheduledLocal, setScheduledLocal] = useState("");

  const [busy, setBusy] = useState<null | "plan" | "generate" | "carousel" | "publish">(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedMedia = selected.map((id) => media.find((m) => m.id === id)).filter((m): m is MediaItem => Boolean(m));

  async function run<T>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) {
    setBusy(kind);
    setError("");
    setSuccess("");
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function plan() {
    const result = await run("plan", () =>
      api<{ plan: { caption: string; hashtags: string[]; style: string; slides: SlideDraft[] } }>("/api/studio/plan", {
        method: "POST",
        json: { topic, slides: slideCount, brand, network: networks[0] ?? "instagram" },
      }),
    );
    if (!result) return;
    setSlides(result.plan.slides);
    setSlideMedia({});
    setFailedSlides([]);
    if (!style) setStyle(result.plan.style);
    const tags = result.plan.hashtags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
    setCaption([result.plan.caption, tags].filter(Boolean).join("\n\n"));
  }

  type GenerateResponse = { media: Array<MediaItem & { slideIndex: number }>; failed: Array<{ index: number; title?: string; error: string }> };

  async function generate(onlyIndexes?: number[]) {
    const targets = onlyIndexes ?? slides.map((_, i) => i);
    const payload =
      mode === "carousel"
        ? { slides: targets.map((i) => ({ index: i, prompt: slides[i].imagePrompt, title: slides[i].title, text: slides[i].text })), style, format, quality }
        : { prompt, n: count, style, format, quality };

    const result = await run("generate", () => {
      if (references.length === 0) return api<GenerateResponse>("/api/studio/generate", { method: "POST", json: payload });
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      references.forEach((f) => form.append("references", f));
      return api<GenerateResponse>("/api/studio/generate", { method: "POST", body: form });
    });
    if (!result) return;
    setMedia((prev) => [...result.media, ...prev]);
    if (mode === "carousel") {
      // El carrusel sigue el orden de las láminas, aunque se regeneren por partes.
      const map = { ...(onlyIndexes ? slideMedia : {}) };
      for (const m of result.media) map[m.slideIndex] = m.id;
      setSlideMedia(map);
      setSelected(
        Object.keys(map)
          .map(Number)
          .sort((a, b) => a - b)
          .map((i) => map[i]),
      );
      setFailedSlides(result.failed.map((f) => f.index));
      if (result.failed.length) {
        setError(
          `No se pudieron generar ${result.failed.length} lámina(s): ${result.failed.map((f) => `${f.index + 1}${f.title ? ` (${f.title})` : ""}`).join(", ")}. Las demás se guardaron; puedes reintentar solo las que faltan.`,
        );
      }
    } else {
      setSelected((prev) => [result.media[0]?.id, ...prev].filter(Boolean).slice(0, 10));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 10 ? prev : [...prev, id]));
  }

  function move(id: string, delta: number) {
    setSelected((prev) => {
      const i = prev.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  const mediaPayload = () => selectedMedia.map((m) => ({ id: m.id, url: m.url, title: m.title, text: m.text, prompt: m.prompt }));

  async function sendToCarousel() {
    // Se abre la pestaña antes del await para que el navegador no la bloquee.
    const tab = window.open("about:blank", "_blank");
    const result = await run("carousel", () =>
      api<{ openUrl: string }>("/api/studio/carousel", { method: "POST", json: { media: mediaPayload(), caption, networks, format } }),
    );
    if (result && tab) {
      tab.location.href = result.openUrl;
      setSuccess("Borrador creado y abierto en Carrusel Studio. Cuando exportes desde allí, volverá a la cola de publicación.");
    } else {
      tab?.close();
    }
  }

  async function publish() {
    const scheduledAt = publishChoice === "schedule" ? localToIso(scheduledLocal) : null;
    if (publishChoice === "schedule" && !scheduledAt) {
      setError("Elige fecha y hora para programar.");
      return;
    }
    const result = await run("publish", () =>
      api<{ post: ClientPost }>("/api/studio/posts", {
        method: "POST",
        json: {
          media: mediaPayload(),
          caption,
          networks,
          format,
          source: "studio",
          // Programar = publicación directa a la hora indicada (sin paso de aprobación).
          mode: publishChoice === "approval" ? "approval" : "direct",
          scheduledAt,
        },
      }),
    );
    if (!result) return;
    const { post } = result;
    const failed = post.results.filter((r) => !r.ok);
    if (post.status === "pending_approval") setSuccess("Enviado a aprobación. Lo verás en la cola “Por aprobar”.");
    else if (post.status === "approved") setSuccess("Programado. Se publicará automáticamente a la hora indicada.");
    else if (post.status === "sent") setSuccess("Entregado. Falta la confirmación de n8n o de Instagram; el estado se actualizará solo en la cola.");
    else if (failed.length) setError(`Algunas redes fallaron: ${failed.map((f) => `${f.network} (${f.error})`).join(", ")}`);
    else setSuccess("¡Publicado!");
    onPublished(post);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card title="1. Qué quieres crear" hint="Generador de imágenes de OpenAI (el mismo motor de ChatGPT).">
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(
              [
                { key: "carousel", label: "Carrusel", icon: Layers },
                { key: "single", label: "Imagen suelta", icon: ImagePlus },
              ] as const
            ).map(({ key, label, icon: Ico }) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => setMode(key)}
                className={cn(
                  "focus-ring flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium",
                  mode === key ? "border-cyan/60 bg-primary/15 text-cyan" : "border-border text-muted hover:text-foreground",
                )}
              >
                <Ico className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          {mode === "single" ? (
            <div className="space-y-3">
              <Field label="Describe la imagen">
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ej: Taza de café humeante sobre mesa de madera, granos alrededor, luz de mañana"
                  className={cn(inputClass, "resize-y")}
                />
              </Field>
              <Field label="Variaciones">
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputClass}>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Tema del carrusel">
                <textarea
                  rows={3}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ej: 5 errores que frenan las ventas de un restaurante por WhatsApp"
                  className={cn(inputClass, "resize-y")}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Láminas">
                  <input type="number" min={2} max={10} value={slideCount} onChange={(e) => setSlideCount(Math.max(2, Math.min(10, Number(e.target.value) || 2)))} className={inputClass} />
                </Field>
                <Field label="Marca (opcional)">
                  <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Café Aurora" className={inputClass} />
                </Field>
              </div>
              <Btn onClick={plan} disabled={!topic.trim() || busy !== null} className="w-full">
                {busy === "plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Planificar láminas con iA
              </Btn>
              {slides.length > 0 ? (
                <ol className="space-y-2">
                  {slides.map((s, i) => (
                    <li key={i} className="space-y-1.5 rounded-xl border border-border bg-background p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-cyan">{i + 1}</span>
                        <input
                          value={s.title}
                          onChange={(e) => setSlides((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                          className={cn(inputClass, "py-1 text-xs")}
                          aria-label={`Título lámina ${i + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setSlides((prev) => prev.filter((_, j) => j !== i));
                            setSlideMedia({});
                            setFailedSlides([]);
                          }}
                          className="focus-ring rounded p-1 text-muted hover:text-sign-signal"
                          aria-label={`Quitar lámina ${i + 1}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={s.imagePrompt}
                        onChange={(e) => setSlides((prev) => prev.map((x, j) => (j === i ? { ...x, imagePrompt: e.target.value } : x)))}
                        className={cn(inputClass, "resize-y py-1 text-xs")}
                        aria-label={`Prompt de imagen lámina ${i + 1}`}
                      />
                    </li>
                  ))}
                  <Btn
                    className="w-full text-xs"
                    onClick={() => setSlides((prev) => [...prev, { title: `Lámina ${prev.length + 1}`, text: "", imagePrompt: "" }].slice(0, 10))}
                  >
                    + Agregar lámina
                  </Btn>
                </ol>
              ) : (
                <p className="text-[11px] text-muted">También puedes agregar láminas a mano sin planificar.</p>
              )}
              {slides.length === 0 ? (
                <Btn className="w-full text-xs" onClick={() => setSlides([{ title: "Lámina 1", text: "", imagePrompt: "" }])}>
                  + Agregar lámina manual
                </Btn>
              ) : null}
            </div>
          )}
        </Card>

        <Card title="2. Estilo y formato">
          <div className="space-y-3">
            <Field label="Dirección de arte" hint="Se aplica a todas las imágenes para que el carrusel sea coherente.">
              <textarea rows={2} value={style} onChange={(e) => setStyle(e.target.value)} className={cn(inputClass, "resize-y")} placeholder="Colores de marca, tipo de luz, estilo…" />
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => setStyle(p.value)} className="focus-ring rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:border-cyan/50 hover:text-cyan">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Formato">
                <select value={format} onChange={(e) => setFormat(e.target.value as AspectFormat)} className={inputClass}>
                  {FORMATS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Calidad" hint={QUALITY_HINT[quality]}>
                <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)} className={inputClass}>
                  <option value="low">Borrador</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                </select>
              </Field>
            </div>
            <Field label="Imágenes de referencia (opcional)" hint="Logo, producto o estilo a respetar. PNG/JPG/WebP, máx. 8 MB c/u.">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => setReferences(Array.from(e.target.files ?? []).slice(0, 4))}
                className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary/20 file:px-3 file:py-1.5 file:text-cyan"
              />
            </Field>
          </div>
          {mode === "carousel" && failedSlides.length > 0 ? (
            <Btn className="mt-4 w-full" onClick={() => generate(failedSlides)} disabled={busy !== null}>
              Reintentar {failedSlides.length} lámina(s) que fallaron
            </Btn>
          ) : null}
          <Btn
            variant="primary"
            className="mt-4 w-full"
            onClick={() => generate()}
            disabled={busy !== null || (mode === "single" ? !prompt.trim() : slides.length === 0 || slides.some((s) => !s.imagePrompt.trim()))}
          >
            {busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy === "generate" ? "Generando… (puede tardar 1-2 min)" : mode === "carousel" ? `Generar ${slides.length || ""} imágenes` : "Generar imágenes"}
          </Btn>
        </Card>
      </div>

      <div className="space-y-5">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {success ? <Notice tone="success">{success}</Notice> : null}

        <Card
          title="3. Imágenes generadas"
          hint={media.length ? "Toca para seleccionar. El orden de selección es el orden del carrusel (máx. 10)." : undefined}
        >
          {media.length === 0 ? (
            <div className="flex aspect-[16/7] items-center justify-center rounded-xl border-2 border-dashed border-border text-center text-sm text-muted">
              {busy === "generate" ? <Loader2 className="h-6 w-6 animate-spin text-cyan" /> : "Aquí aparecerán tus imágenes."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {media.map((m) => {
                const pos = selected.indexOf(m.id);
                return (
                  <figure key={m.id} className={cn("group relative overflow-hidden rounded-xl border-2", pos >= 0 ? "border-cyan" : "border-transparent")}>
                    <button type="button" onClick={() => toggle(m.id)} className="focus-ring block w-full" aria-pressed={pos >= 0} aria-label={m.title || m.prompt || "Imagen generada"}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt={m.title || m.prompt || ""} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                    </button>
                    {pos >= 0 ? (
                      <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-cyan text-xs font-bold text-background">{pos + 1}</span>
                    ) : null}
                    <a
                      href={m.url}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="focus-ring absolute right-2 top-2 rounded-lg bg-background/80 p-1.5 text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      aria-label="Descargar"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    {m.title ? <figcaption className="truncate bg-background/90 px-2 py-1 text-[11px] text-muted">{m.title}</figcaption> : null}
                  </figure>
                );
              })}
            </div>
          )}

          {selectedMedia.length > 1 ? (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-foreground/90">Orden del carrusel</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedMedia.map((m, i) => (
                  <div key={m.id} className="w-20 shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.url} alt="" className="aspect-[4/5] w-full rounded-lg object-cover" />
                    <div className="mt-1 flex justify-between">
                      <button type="button" onClick={() => move(m.id, -1)} disabled={i === 0} className="focus-ring rounded p-0.5 text-muted disabled:opacity-30" aria-label="Mover a la izquierda">
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[11px] text-muted">{i + 1}</span>
                      <button type="button" onClick={() => move(m.id, 1)} disabled={i === selectedMedia.length - 1} className="focus-ring rounded p-0.5 text-muted disabled:opacity-30" aria-label="Mover a la derecha">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="4. Publicar" hint="Usa las redes conectadas en la pestaña Conexiones (directo o vía n8n).">
          <div className="space-y-4">
            <Field label="Texto del post (caption)">
              <textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} className={cn(inputClass, "resize-y")} placeholder="Escribe el copy, hashtags y llamado a la acción…" />
            </Field>
            <Field label="Redes" group>
              <NetworkPicker value={networks} onChange={setNetworks} />
            </Field>
            <div>
              <p className="mb-1.5 text-xs font-medium text-foreground/90">Cómo publicar</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { key: "approval", label: "Con aprobación", hint: "Queda en cola hasta que alguien apruebe" },
                    { key: "direct", label: "Publicar ya", hint: "Se publica al instante" },
                    { key: "schedule", label: "Programar", hint: "Se publica sola a la hora elegida" },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    aria-pressed={publishChoice === o.key}
                    onClick={() => setPublishChoice(o.key)}
                    className={cn(
                      "focus-ring rounded-xl border px-3 py-2 text-left",
                      publishChoice === o.key ? "border-cyan/60 bg-primary/15" : "border-border hover:border-cyan/30",
                    )}
                  >
                    <span className={cn("block text-sm font-medium", publishChoice === o.key ? "text-cyan" : "text-foreground")}>{o.label}</span>
                    <span className="block text-[11px] text-muted">{o.hint}</span>
                  </button>
                ))}
              </div>
              {publishChoice === "schedule" ? (
                <input type="datetime-local" value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} className={cn(inputClass, "mt-2 sm:w-64")} aria-label="Fecha y hora de publicación" />
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Btn onClick={sendToCarousel} disabled={busy !== null || selectedMedia.length === 0}>
                {busy === "carousel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                Editar en Carrusel Studio
              </Btn>
              <Btn variant="primary" onClick={publish} disabled={busy !== null || selectedMedia.length === 0 || networks.length === 0}>
                {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : publishChoice === "approval" ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {publishChoice === "approval" ? "Enviar a aprobación" : publishChoice === "schedule" ? "Programar" : "Publicar ahora"}
              </Btn>
            </div>
            <p className="text-[11px] text-muted">
              {selectedMedia.length} imagen(es) seleccionada(s). “Editar en Carrusel Studio” abre las imágenes allí para añadir títulos y diseño; al exportar vuelven a la cola.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
