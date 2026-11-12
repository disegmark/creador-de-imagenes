import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { deletePost, getPost, updatePost } from "@/lib/studio/repo";
import { inputErrorResponse, readJson } from "@/lib/studio/service";
import { isNetwork, type Post } from "@/lib/studio/types";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const LOCKED: Post["status"][] = ["publishing", "sent", "published"];

export async function GET(request: Request, ctx: Ctx) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  const post = await getPost(ws.id, (await ctx.params).id);
  return post ? Response.json({ post }) : Response.json({ error: "not_found" }, { status: 404 });
}

/** Edita caption, redes, programación u orden de imágenes mientras no se haya enviado. */
export async function PATCH(request: Request, ctx: Ctx) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  try {
    const body = await readJson(request);
    const { id } = await ctx.params;
    let locked = false;
    const post = await updatePost(ws.id, id, (p) => {
      locked = false; // la función puede repetirse si hubo un cambio simultáneo
      if (LOCKED.includes(p.status)) {
        locked = true;
        return null;
      }
      const changes: Partial<Post> = {};
      if (typeof body.caption === "string") changes.caption = body.caption.slice(0, 2200);
      if (Array.isArray(body.networks)) changes.networks = [...new Set(body.networks.filter(isNetwork))];
      if ("scheduledAt" in body) {
        const s = body.scheduledAt;
        changes.scheduledAt = typeof s === "string" && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null;
      }
      if (Array.isArray(body.mediaOrder)) {
        const order = body.mediaOrder.filter((x): x is string => typeof x === "string");
        const reordered = order.map((mid) => p.media.find((m) => m.id === mid)).filter((m) => m !== undefined);
        if (reordered.length > 0) changes.media = reordered;
      }
      return changes;
    });
    if (!post) return Response.json({ error: "not_found" }, { status: 404 });
    if (locked) return Response.json({ error: "already_published", post }, { status: 409 });
    return Response.json({ post });
  } catch (error) {
    return inputErrorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  try {
    const ok = await deletePost(ws.id, (await ctx.params).id);
    return ok ? Response.json({ ok }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
