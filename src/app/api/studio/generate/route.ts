import { isAuthorized, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled, publicBase } from "@/lib/studio/config";
import { generateImages, ImageGenerationError, type ImageQuality } from "@/lib/studio/openai-images";
import { saveMedia } from "@/lib/studio/repo";
import type { AspectFormat } from "@/lib/studio/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const FORMATS: AspectFormat[] = ["4:5", "1:1", "9:16", "16:9"];
const QUALITIES: ImageQuality[] = ["low", "medium", "high", "auto"];
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

type Job = { prompt: string; title?: string; text?: string };

/**
 * Genera imágenes con el modelo de imágenes de OpenAI (el mismo de ChatGPT).
 * Body JSON o multipart:
 *  - prompt + n            → n variaciones del mismo prompt
 *  - slides: [{prompt, title, text}] → una imagen por lámina (carrusel), con estilo común
 *  - style, format, quality
 *  - references (multipart, opcional) → logo/producto/estilo de referencia
 */
export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await isAuthorized(request))) return unauthorized();

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
      .map((s) => ({ prompt: String(s?.prompt ?? "").trim(), title: s?.title ? String(s.title) : undefined, text: s?.text ? String(s.text) : undefined }))
      .filter((s) => s.prompt.length > 0);
  } else if (typeof body.prompt === "string" && body.prompt.trim()) {
    jobs = [{ prompt: body.prompt.trim() }];
    n = Math.max(1, Math.min(4, Number(body.n) || 1));
  }
  if (jobs.length === 0) return Response.json({ error: "prompt_required" }, { status: 422 });
  if (jobs.some((j) => j.prompt.length > 4000)) return Response.json({ error: "prompt_too_long" }, { status: 422 });

  const base = publicBase(request);
  try {
    const results = await Promise.all(
      jobs.map(async (job) => {
        const fullPrompt = style ? `${job.prompt}\n\nArt direction (keep consistent): ${style}` : job.prompt;
        const images = await generateImages({ prompt: fullPrompt, format, quality, n, references });
        return Promise.all(images.map((img) => saveMedia(img.data, img.contentType, base, { prompt: job.prompt, title: job.title, text: job.text })));
      }),
    );
    return Response.json({ media: results.flat() });
  } catch (error) {
    if (error instanceof ImageGenerationError) {
      console.error("[studio/generate]", error.status, error.message);
      const status = error.status === 400 ? 422 : error.status === 429 ? 429 : error.status === 503 ? 503 : 502;
      return Response.json({ error: error.code ?? "generation_failed", message: error.message }, { status });
    }
    console.error("[studio/generate]", error);
    return Response.json({ error: "generation_failed", message: (error as Error).message }, { status: 500 });
  }
}
