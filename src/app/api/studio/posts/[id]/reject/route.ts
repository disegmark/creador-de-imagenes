import { isAuthorized, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";
import { updatePost } from "@/lib/studio/repo";

export const runtime = "nodejs";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await isAuthorized(request))) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
  const post = await updatePost((await ctx.params).id, (p) =>
    p.status === "pending_approval" || p.status === "approved" || p.status === "draft" ? { status: "rejected", note } : null,
  );
  return post ? Response.json({ post }) : Response.json({ error: "not_found" }, { status: 404 });
}
