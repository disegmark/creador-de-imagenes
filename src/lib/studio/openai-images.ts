import { studioConfig } from "./config";
import type { AspectFormat } from "./types";

export type ImageQuality = "low" | "medium" | "high" | "auto";

/** Tamaños nativos del generador de imágenes de OpenAI (el mismo motor de ChatGPT). */
export function sizeForFormat(format: AspectFormat) {
  switch (format) {
    case "1:1":
      return "1024x1024";
    case "16:9":
      return "1536x1024";
    default:
      // 4:5 y 9:16 → vertical; Carrusel Studio recorta al formato final.
      return "1024x1536";
  }
}

export type GenerateInput = {
  prompt: string;
  format: AspectFormat;
  quality: ImageQuality;
  n: number;
  /** Imágenes de referencia (logo, producto, estilo) → usa el endpoint de edición. */
  references?: Array<{ data: Buffer; contentType: string; name: string }>;
};

export type GeneratedImage = { data: Buffer; contentType: string; revisedPrompt?: string };

export class ImageGenerationError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type OpenAIImageResponse = {
  data?: Array<{ b64_json?: string; revised_prompt?: string }>;
  error?: { message?: string; code?: string };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reintenta los 429/5xx de OpenAI (hasta 2 veces, respetando Retry-After, máx. 20 s). */
export async function generateImages(input: GenerateInput): Promise<GeneratedImage[]> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await generateOnce(input);
    } catch (error) {
      const e = error as ImageGenerationError & { retryAfter?: number };
      const retryable = e instanceof ImageGenerationError && (e.status === 429 || e.status >= 500);
      if (!retryable || attempt >= 2) throw error;
      await sleep(Math.min(20_000, (e.retryAfter ?? 2 ** attempt * 3) * 1000));
    }
  }
}

async function generateOnce(input: GenerateInput): Promise<GeneratedImage[]> {
  if (!studioConfig.openaiKey) throw new ImageGenerationError("OPENAI_API_KEY no configurada", 503, "not_configured");

  const common = {
    model: studioConfig.openaiImageModel,
    prompt: input.prompt,
    n: input.n,
    size: sizeForFormat(input.format),
    quality: input.quality,
    output_format: "png",
  };

  let res: Response;
  if (input.references?.length) {
    const form = new FormData();
    for (const [k, v] of Object.entries(common)) form.append(k, String(v));
    for (const ref of input.references) {
      form.append("image[]", new Blob([new Uint8Array(ref.data)], { type: ref.contentType }), ref.name);
    }
    res = await fetch(`${studioConfig.openaiBaseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${studioConfig.openaiKey}` },
      body: form,
    });
  } else {
    res = await fetch(`${studioConfig.openaiBaseUrl}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${studioConfig.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(common),
    });
  }

  const json = (await res.json().catch(() => ({}))) as OpenAIImageResponse;
  if (!res.ok) {
    const err = new ImageGenerationError(json.error?.message ?? `OpenAI respondió ${res.status}`, res.status, json.error?.code);
    const retryAfter = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) (err as ImageGenerationError & { retryAfter?: number }).retryAfter = retryAfter;
    throw err;
  }
  return (json.data ?? [])
    .filter((d) => d.b64_json)
    .map((d) => ({ data: Buffer.from(d.b64_json!, "base64"), contentType: "image/png", revisedPrompt: d.revised_prompt }));
}
