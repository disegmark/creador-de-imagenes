import { isAuthorized, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled, publicBase } from "@/lib/studio/config";
import { approvePost } from "@/lib/studio/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Aprueba (panel o n8n con API key). Si no está programado, se publica de inmediato. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await isAuthorized(request))) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { note?: unknown };
  const post = await approvePost((await ctx.params).id, publicBase(request), typeof body.note === "string" ? body.note.slice(0, 500) : undefined);
  return post ? Response.json({ post }) : Response.json({ error: "not_found_or_not_pending" }, { status: 409 });
}
