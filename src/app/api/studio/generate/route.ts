import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { publicBase, studioConfig } from "@/lib/studio/config";
import { generateImages, ImageGenerationError, type ImageQuality } from "@/lib/studio/openai-images";
import { saveMedia } from "@/lib/studio/repo";
import type { AspectFormat, MediaItem } from "@/lib/studio/types";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";
export const maxDuration = 300;

const FORMATS: AspectFormat[] = ["4:5", "1:1", "9:16", "16:9"];
const QUALITIES: ImageQuality[] = ["low", "medium", "high", "auto"];
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

type Job = { index: number; prompt: string; title?: string; text?: string };

/** Ejecuta las tareas de a `limit` a la vez (no se lanzan 10 imágenes de golpe). */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
    }),
  );
}

/**
 * Genera imágenes con el modelo de imágenes de OpenAI (el mismo de ChatGPT).
 * Body JSON o multipart:
 *  - prompt + n            → n variaciones del mismo prompt
 *  - slides: [{prompt, title, text, index?}] → una imagen por lámina (carrusel), con estilo común
 *  - style, format, quality
 *  - references (multipart, opcional) → logo/producto/estilo de referencia
 * Cada imagen se guarda en cuanto está lista: si alguna falla (p. ej. límite de
 * OpenAI), las demás no se pierden y se devuelven junto con la lista de fallidas.
 */
export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();

  let body: Record<string, unknown> = {};
  const references: Array<{ data: Buffer; contentType: string; name: string }> = [];
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("payload") ?? "{}"));
      for (const file of form.getAll("references")) {
        if (!(file instanceof File) || !/^image\/(png|jpeg|webp)$/.test(file.type)) continue;
        if (file.size > MAX_REFERENCE_BYTES) return Response.json({ error: "reference_too_large" }, { status: 422 });
        references.push({ data: Buffer.from(await file.arrayBuffer()), contentType: file.type, name: file.name || "ref.png" });
      }
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    return Response.json({ error: "invalid_payload" }, { status: 400 });
  }

  const format = FORMATS.includes(body.format as AspectFormat) ? (body.format as AspectFormat) : "4:5";
  const quality = QUALITIES.includes(body.quality as ImageQuality) ? (body.quality as ImageQuality) : "medium";
  const style = typeof body.style === "string" ? body.style.trim().slice(0, 1000) : "";

  let jobs: Job[] = [];
  let n = 1;
  if (Array.isArray(body.slides) && body.slides.length > 0) {
    jobs = (body.slides as Array<Record<string, unknown>>)
      .slice(0, 10)
      .map((s, i) => ({
        index: Number.isInteger(s?.index) ? Number(s.index) : i,
        prompt: String(s?.prompt ?? "").trim(),
        title: s?.title ? String(s.title) : undefined,
        text: s?.text ? String(s.text) : undefined,
      }))
      .filter((s) => s.prompt.length > 0);
  } else if (typeof body.prompt === "string" && body.prompt.trim()) {
    jobs = [{ index: 0, prompt: body.prompt.trim() }];
    n = Math.max(1, Math.min(4, Number(body.n) || 1));
  }
  if (jobs.length === 0) return Response.json({ error: "prompt_required" }, { status: 422 });
  if (jobs.some((j) => j.prompt.length > 4000)) return Response.json({ error: "prompt_too_long" }, { status: 422 });

  const base = publicBase(request);
  const media: Array<MediaItem & { slideIndex: number }> = [];
  const failed: Array<{ index: number; title?: string; error: string; code?: string; status: number }> = [];

  await pool(jobs, studioConfig.imageConcurrency, async (job) => {
    try {
      const fullPrompt = style ? `${job.prompt}\n\nArt direction (keep consistent): ${style}` : job.prompt;
      const images = await generateImages({ prompt: fullPrompt, format, quality, n, references });
      for (const img of images) {
        const item = await saveMedia(ws.id, img.data, img.contentType, base, { prompt: job.prompt, title: job.title, text: job.text });
        media.push({ ...item, slideIndex: job.index });
      }
    } catch (error) {
      const e = error instanceof ImageGenerationError ? error : null;
      console.error("[studio/generate]", e?.status ?? "", (error as Error).message);
      failed.push({ index: job.index, title: job.title, error: (error as Error).message, code: e?.code, status: e?.status ?? 500 });
    }
  });

  media.sort((a, b) => a.slideIndex - b.slideIndex);
  failed.sort((a, b) => a.index - b.index);

  if (media.length === 0) {
    const first = failed[0];
    const status = first.status === 400 ? 422 : first.status === 429 ? 429 : first.status === 503 ? 503 : 502;
    return Response.json({ error: first.code ?? "generation_failed", message: first.error, failed }, { status });
  }
  return Response.json({ media, failed });
}
