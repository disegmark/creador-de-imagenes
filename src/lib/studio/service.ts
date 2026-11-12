import { publicBase } from "./config";
import { ConflictError, createPost, getSettings, saveMedia, updatePost } from "./repo";
import { isDue, publishPost } from "./publish";
import { notifyApprovalNeeded } from "./publishers/n8n";
import { isNetwork, type AspectFormat, type MediaItem, type Network, type Post, type PublishMode } from "./types";
import type { Workspace } from "./workspaces";

const FORMATS: AspectFormat[] = ["4:5", "1:1", "9:16", "16:9"];
const MAX_MEDIA = 10;
const MAX_CAPTION = 2200; // límite de Instagram

export class InputError extends Error {}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    /* cae al error */
  }
  throw new InputError("invalid_json");
}

function parseNetworks(value: unknown): Network[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isNetwork))];
}

function parseSchedule(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new InputError("invalid_scheduledAt");
  return new Date(value).toISOString();
}

/**
 * Normaliza la lista de imágenes. Acepta:
 *  - { id, url, ... } ya guardadas por el Studio
 *  - { url } externa https (p. ej. láminas exportadas por Carrusel Studio)
 *  - { dataUrl: "data:image/png;base64,..." } → se sube al almacenamiento
 */
export async function parseMedia(ws: string, value: unknown, base: string): Promise<MediaItem[]> {
  if (!Array.isArray(value) || value.length === 0) throw new InputError("media_required");
  if (value.length > MAX_MEDIA) throw new InputError("too_many_media");
  const items: MediaItem[] = [];
  for (const raw of value) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.slice(0, 200) : undefined;
    const text = typeof entry.text === "string" ? entry.text.slice(0, 600) : undefined;
    const prompt = typeof entry.prompt === "string" ? entry.prompt.slice(0, 4000) : undefined;
    if (typeof entry.dataUrl === "string") {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(entry.dataUrl);
      if (!match) throw new InputError("invalid_dataUrl");
      const data = Buffer.from(match[2], "base64");
      if (data.length > 8 * 1024 * 1024) throw new InputError("image_too_large");
      items.push(await saveMedia(ws, data, match[1], base, { title, text, prompt }));
    } else if (typeof entry.url === "string" && (/^https:\/\//.test(entry.url) || entry.url.startsWith(`${base}/`))) {
      items.push({
        id: typeof entry.id === "string" ? entry.id : entry.url,
        url: entry.url,
        contentType: typeof entry.contentType === "string" ? entry.contentType : "image/png",
        createdAt: new Date().toISOString(),
        title,
        text,
        prompt,
      });
    } else {
      throw new InputError("invalid_media_url");
    }
  }
  return items;
}

export async function createPostFromInput(ws: Workspace, body: Record<string, unknown>, request: Request, source: Post["source"]) {
  const base = publicBase(request);
  const settings = await getSettings(ws.id);
  const caption = typeof body.caption === "string" ? body.caption.slice(0, MAX_CAPTION) : "";
  const networks = parseNetworks(body.networks);
  const mode: PublishMode = body.mode === "direct" || body.mode === "approval" ? body.mode : settings.defaultMode;
  const format = FORMATS.includes(body.format as AspectFormat) ? (body.format as AspectFormat) : "4:5";
  const scheduledAt = parseSchedule(body.scheduledAt);
  const asDraft = body.draft === true;
  const media = await parseMedia(ws.id, body.media, base);

  if (!asDraft && networks.length === 0) throw new InputError("networks_required");

  const post = await createPost(ws.id, {
    caption,
    media,
    networks,
    mode,
    format,
    scheduledAt,
    source,
    status: asDraft ? "draft" : mode === "approval" ? "pending_approval" : "approved",
  });

  return afterStatusChange(ws, post, base);
}

/** Efectos tras crear/aprobar: pedir aprobación o publicar si ya toca. */
export async function afterStatusChange(ws: Workspace, post: Post, base: string): Promise<Post> {
  if (post.status === "pending_approval") {
    await notifyApprovalNeeded(ws, post, base);
    return post;
  }
  if (post.status === "approved" && isDue(post)) {
    return (await publishPost(ws, post.id, base)) ?? post;
  }
  return post;
}

/** Solo un post "por aprobar" (o borrador/rechazado desde el panel) puede aprobarse. */
export async function approvePost(ws: Workspace, id: string, base: string, note?: string) {
  let approved = false;
  const updated = await updatePost(ws.id, id, (p) => {
    approved = false; // la función puede repetirse si hubo un cambio simultáneo
    if (!["pending_approval", "draft", "rejected"].includes(p.status) || p.networks.length === 0) return null;
    approved = true;
    return { status: "approved", note: note ?? p.note };
  });
  if (!updated || !approved) return null;
  return afterStatusChange(ws, updated, base);
}

export function inputErrorResponse(error: unknown) {
  if (error instanceof InputError) return Response.json({ error: error.message }, { status: 422 });
  if (error instanceof ConflictError) return Response.json({ error: "conflict", message: error.message }, { status: 409 });
  console.error("[studio]", error);
  return Response.json({ error: "server_error", message: (error as Error)?.message }, { status: 500 });
}
