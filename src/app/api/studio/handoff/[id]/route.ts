import { publicBase } from "@/lib/studio/config";
import { corsHeaders, verifyHandoff } from "@/lib/studio/handoff";
import { getPost, updatePost } from "@/lib/studio/repo";
import { afterStatusChange, inputErrorResponse, parseMedia } from "@/lib/studio/service";
import { isNetwork } from "@/lib/studio/types";
import { getWorkspace, isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function resolve(request: Request, id: string) {
  if (!isStudioEnabled()) return null;
  return getWorkspace(verifyHandoff(id, new URL(request.url).searchParams));
}

/**
 * Carrusel Studio lee aquí las imágenes generadas (enlace firmado, caduca en 24 h):
 * GET /api/studio/handoff/:id?w=&exp=&sig=  →  { format, caption, slides: [{ url, title, text }], returnUrl, expiresAt }
 * Solo funciona mientras el post sea un borrador enviado a Carrusel Studio.
 */
export async function GET(request: Request, ctx: Ctx) {
  const headers = { ...corsHeaders(request), "Cache-Control": "no-store" };
  const { id } = await ctx.params;
  const ws = resolve(request, id);
  if (!ws) return Response.json({ error: "invalid_or_expired_link" }, { status: 403, headers });
  const post = await getPost(ws.id, id);
  if (!post) return Response.json({ error: "not_found" }, { status: 404, headers });
  if (post.status !== "draft") return Response.json({ error: "already_sent" }, { status: 409, headers });
  const url = new URL(request.url);
  return Response.json(
    {
      id: post.id,
      format: post.format,
      caption: post.caption,
      networks: post.networks,
      slides: post.media.map((m) => ({ url: m.url, title: m.title ?? "", text: m.text ?? "" })),
      returnUrl: `${publicBase(request)}${url.pathname}${url.search}`,
      expiresAt: new Date(Number(url.searchParams.get("exp"))).toISOString(),
    },
    { headers },
  );
}

/**
 * Carrusel Studio devuelve las láminas finales (con texto ya compuesto):
 * POST { slides: [{ dataUrl | url }], caption?, networks?, mode?: "approval" | "draft" }
 *
 * Este enlace NUNCA publica: como mucho deja el post "por aprobar". Publicar
 * se decide en el panel (o con la clave de API del espacio). Funciona una sola
 * vez: al enviarlo, el post deja de ser borrador y el enlace queda inservible.
 */
export async function POST(request: Request, ctx: Ctx) {
  const headers = corsHeaders(request);
  const { id } = await ctx.params;
  const ws = resolve(request, id);
  if (!ws) return Response.json({ error: "invalid_or_expired_link" }, { status: 403, headers });

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const slides = Array.isArray(body?.slides) ? body!.slides : [];
    if (slides.length === 0) return Response.json({ error: "slides_required" }, { status: 422, headers });
    const current = await getPost(ws.id, id);
    if (!current) return Response.json({ error: "not_found" }, { status: 404, headers });
    if (current.status !== "draft") return Response.json({ error: "already_sent" }, { status: 409, headers });

    const base = publicBase(request);
    const media = await parseMedia(ws.id, slides, base);
    const networks = Array.isArray(body?.networks) ? [...new Set((body!.networks as unknown[]).filter(isNetwork))] : undefined;
    const keepDraft = body?.mode === "draft";

    let accepted = false;
    const updated = await updatePost(ws.id, id, (p) => {
      accepted = false; // la función puede repetirse si hubo un cambio simultáneo
      if (p.status !== "draft") return null; // otro envío llegó primero
      accepted = true;
      const nextNetworks = networks ?? p.networks;
      return {
        media,
        source: "carrusel",
        caption: typeof body?.caption === "string" ? body.caption.slice(0, 2200) : p.caption,
        networks: nextNetworks,
        mode: "approval",
        status: keepDraft || nextNetworks.length === 0 ? "draft" : "pending_approval",
      };
    });
    if (!updated || !accepted) return Response.json({ error: "already_sent" }, { status: 409, headers });
    const post = await afterStatusChange(ws, updated, base);
    return Response.json({ post: { id: post.id, status: post.status } }, { headers });
  } catch (error) {
    const res = inputErrorResponse(error);
    return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...headers } });
  }
}
