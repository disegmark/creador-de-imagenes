import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { publicBase } from "@/lib/studio/config";
import { approvePost, inputErrorResponse } from "@/lib/studio/service";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Aprueba (panel o n8n con la clave del espacio). Si no está programado, se publica de inmediato. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  try {
    const body = (await request.json().catch(() => ({}))) as { note?: unknown };
    const post = await approvePost(ws, (await ctx.params).id, publicBase(request), typeof body.note === "string" ? body.note.slice(0, 500) : undefined);
    return post ? Response.json({ post }) : Response.json({ error: "not_found_or_not_pending" }, { status: 409 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
