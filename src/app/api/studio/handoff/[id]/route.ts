import { isStudioEnabled, publicBase } from "@/lib/studio/config";
import { corsHeaders, verifyHandoff } from "@/lib/studio/handoff";
import { getPost, getSettings, saveMedia, updatePost } from "@/lib/studio/repo";
import { afterStatusChange } from "@/lib/studio/service";
import { isNetwork, type MediaItem } from "@/lib/studio/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * Carrusel Studio lee aquí las imágenes generadas:
 * GET /api/studio/handoff/:id?sig=...  →  { format, caption, slides: [{ url, title, text }], returnUrl }
 */
export async function GET(request: Request, ctx: Ctx) {
  const headers = corsHeaders(request);
  const { id } = await ctx.params;
  const sig = new URL(request.url).searchParams.get("sig");
  if (!isStudioEnabled() || !verifyHandoff(id, sig)) return Response.json({ error: "invalid_link" }, { status: 403, headers });
  const post = await getPost(id);
  if (!post) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(
    {
      id: post.id,
      format: post.format,
      caption: post.caption,
      networks: post.networks,
      slides: post.media.map((m) => ({ url: m.url, title: m.title ?? "", text: m.text ?? "" })),
      returnUrl: `${publicBase(request)}/api/studio/handoff/${post.id}?sig=${sig}`,
    },
    { headers },
  );
}

/**
 * Carrusel Studio devuelve las láminas finales (con texto ya compuesto):
 * POST { slides: [{ dataUrl | url }], caption?, networks?, mode?: "approval"|"direct"|"draft", scheduledAt? }
 */
export async function POST(request: Request, ctx: Ctx) {
  const headers = corsHeaders(request);
  const { id } = await ctx.params;
  const sig = new URL(request.url).searchParams.get("sig");
  if (!isStudioEnabled() || !verifyHandoff(id, sig)) return Response.json({ error: "invalid_link" }, { status: 403, headers });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const slides = Array.isArray(body?.slides) ? (body!.slides as Array<Record<string, unknown>>).slice(0, 10) : [];
  if (slides.length === 0) return Response.json({ error: "slides_required" }, { status: 422, headers });

  const base = publicBase(request);
  const media: MediaItem[] = [];
  for (const slide of slides) {
    if (typeof slide?.dataUrl === "string") {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(slide.dataUrl);
      if (!match) return Response.json({ error: "invalid_dataUrl" }, { status: 422, headers });
      media.push(await saveMedia(Buffer.from(match[2], "base64"), match[1], base));
    } else if (typeof slide?.url === "string" && /^https?:\/\//.test(slide.url)) {
      media.push({ id: slide.url, url: slide.url, contentType: "image/png", createdAt: new Date().toISOString() });
    }
  }
  if (media.length === 0) return Response.json({ error: "slides_required" }, { status: 422, headers });

  const settings = await getSettings();
  const mode = body?.mode === "direct" || body?.mode === "approval" ? body.mode : body?.mode === "draft" ? "draft" : settings.defaultMode;
  const networks = Array.isArray(body?.networks) ? [...new Set((body!.networks as unknown[]).filter(isNetwork))] : undefined;

  const updated = await updatePost(id, (p) => {
    if (p.status === "publishing" || p.status === "published") return null;
    const nextNetworks = networks ?? p.networks;
    const status = mode === "draft" || nextNetworks.length === 0 ? "draft" : mode === "approval" ? "pending_approval" : "approved";
    return {
      media,
      source: "carrusel",
      caption: typeof body?.caption === "string" ? body.caption.slice(0, 2200) : p.caption,
      networks: nextNetworks,
      mode: mode === "direct" ? "direct" : "approval",
      scheduledAt: typeof body?.scheduledAt === "string" && !Number.isNaN(Date.parse(body.scheduledAt)) ? new Date(body.scheduledAt).toISOString() : p.scheduledAt,
      status,
    };
  });
  if (!updated) return Response.json({ error: "not_found_or_published" }, { status: 409, headers });
  const post = await afterStatusChange(updated, base);
  return Response.json({ post: { id: post.id, status: post.status, results: post.results } }, { headers });
}
