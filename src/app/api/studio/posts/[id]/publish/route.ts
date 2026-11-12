import { isAuthorized, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled, publicBase } from "@/lib/studio/config";
import { publishPost } from "@/lib/studio/publish";
import { updatePost } from "@/lib/studio/repo";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Publicar ahora (ignora la hora programada) o reintentar las redes que fallaron. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await isAuthorized(request))) return unauthorized();
  const { id } = await ctx.params;
  const ready = await updatePost(id, (p) =>
    p.networks.length === 0
      ? null
      : ["pending_approval", "draft", "approved", "rejected"].includes(p.status)
        ? { status: "approved", scheduledAt: null }
        : {},
  );
  if (!ready) return Response.json({ error: "not_found" }, { status: 404 });
  if (ready.networks.length === 0) return Response.json({ error: "networks_required" }, { status: 422 });
  const post = await publishPost(id, publicBase(request));
  return Response.json({ post });
}
