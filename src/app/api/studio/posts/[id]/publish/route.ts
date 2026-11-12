import { authorize, hasPanelSession, notConfigured, unauthorized } from "@/lib/studio/auth";
import { publicBase } from "@/lib/studio/config";
import { isStalePublishing, publishPost } from "@/lib/studio/publish";
import { updatePost } from "@/lib/studio/repo";
import { inputErrorResponse } from "@/lib/studio/service";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * "Publicar ahora" (ignora la hora programada) o "Reintentar" las redes que fallaron.
 * Publicar algo que aún no fue aprobado solo se permite desde el panel (persona con sesión),
 * nunca con un enlace de Carrusel Studio.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  const panel = await hasPanelSession(ws.id);
  const { id } = await ctx.params;
  try {
    let refused: string | null = null;
    const ready = await updatePost(ws.id, id, (p) => {
      refused = null; // la función puede repetirse si hubo un cambio simultáneo
      if (p.networks.length === 0) {
        refused = "networks_required";
        return null;
      }
      if (["pending_approval", "draft", "rejected"].includes(p.status)) {
        if (!panel) {
          refused = "approval_required";
          return null;
        }
        return { status: "approved", scheduledAt: null };
      }
      if (p.status === "approved") return { scheduledAt: null };
      if (p.status === "publishing" && !isStalePublishing(p)) refused = "already_publishing";
      return null;
    });
    if (!ready) return Response.json({ error: "not_found" }, { status: 404 });
    if (refused) return Response.json({ error: refused, post: ready }, { status: refused === "networks_required" ? 422 : 409 });
    const post = await publishPost(ws, id, publicBase(request));
    return Response.json({ post });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
