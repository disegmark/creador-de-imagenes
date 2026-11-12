import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { carouselOpenUrl } from "@/lib/studio/handoff";
import { getPost } from "@/lib/studio/repo";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

/** Genera un enlace nuevo (24 h) para editar en Carrusel Studio un borrador existente. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  const post = await getPost(ws.id, (await ctx.params).id);
  if (!post) return Response.json({ error: "not_found" }, { status: 404 });
  if (post.status !== "draft") return Response.json({ error: "only_drafts" }, { status: 409 });
  return Response.json({ openUrl: carouselOpenUrl(ws.id, post, request) });
}
