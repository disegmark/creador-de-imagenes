import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { updatePost } from "@/lib/studio/repo";
import { inputErrorResponse } from "@/lib/studio/service";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  try {
    const body = (await request.json().catch(() => ({}))) as { note?: unknown };
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
    let rejected = false;
    const post = await updatePost(ws.id, (await ctx.params).id, (p) => {
      rejected = false; // la función puede repetirse si hubo un cambio simultáneo
      if (!["pending_approval", "approved", "draft"].includes(p.status)) return null;
      rejected = true;
      return { status: "rejected", note };
    });
    if (!post) return Response.json({ error: "not_found" }, { status: 404 });
    return rejected ? Response.json({ post }) : Response.json({ error: "not_rejectable", post }, { status: 409 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
