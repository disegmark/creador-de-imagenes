import { encrypt, newId } from "./crypto";
import { getStorage } from "./storage";
import type { MediaItem, MetaConnection, Post, StudioSettings } from "./types";

const MAX_POSTS = 500;
const MAX_ATTEMPTS = 8;

/** Todas las claves llevan el espacio de trabajo: los sistemas no ven datos de otros. */
const k = (ws: string, name: string) => `${ws}--${name}`;

export class ConflictError extends Error {}

/**
 * Lee → modifica → escribe con control de versión. Si otra petición escribió en
 * medio, se vuelve a leer y se reintenta (no se pierden ni duplican cambios).
 */
async function mutate<T, R>(key: string, fn: (current: T | null) => { value: T; result: R } | null): Promise<R | null> {
  const storage = getStorage();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const { value, version } = await storage.getJSON<T>(key);
    const change = fn(value);
    if (!change) return null;
    if (await storage.setJSONIfVersion(key, change.value, version)) return change.result;
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 120 * (attempt + 1)));
  }
  throw new ConflictError("Demasiados cambios simultáneos; inténtalo de nuevo.");
}

async function readJSON<T>(key: string) {
  return (await getStorage().getJSON<T>(key)).value;
}

export async function listPosts(ws: string): Promise<Post[]> {
  return (await readJSON<Post[]>(k(ws, "posts"))) ?? [];
}

export async function getPost(ws: string, id: string) {
  return (await listPosts(ws)).find((p) => p.id === id) ?? null;
}

export async function createPost(ws: string, input: Omit<Post, "id" | "createdAt" | "updatedAt" | "results"> & { results?: Post["results"] }) {
  const now = new Date().toISOString();
  const post: Post = { ...input, results: input.results ?? [], id: newId(), createdAt: now, updatedAt: now };
  await mutate<Post[], Post>(k(ws, "posts"), (posts) => ({ value: [post, ...(posts ?? [])].slice(0, MAX_POSTS), result: post }));
  return post;
}

/**
 * Actualiza un post de forma atómica. `patch` devuelve los cambios, o null para
 * no tocar nada (en ese caso se devuelve el post tal cual está).
 */
export async function updatePost(ws: string, id: string, patch: (post: Post) => Partial<Post> | null): Promise<Post | null> {
  let unchanged: Post | null = null;
  const updated = await mutate<Post[], Post>(k(ws, "posts"), (posts) => {
    unchanged = null; // la función puede repetirse si hubo un cambio simultáneo
    const list = posts ?? [];
    const index = list.findIndex((p) => p.id === id);
    if (index === -1) return null;
    const changes = patch(list[index]);
    if (!changes) {
      unchanged = list[index];
      return null;
    }
    const next: Post = { ...list[index], ...changes, id, updatedAt: new Date().toISOString() };
    const copy = [...list];
    copy[index] = next;
    return { value: copy, result: next };
  });
  return updated ?? unchanged;
}

export async function deletePost(ws: string, id: string) {
  return (
    (await mutate<Post[], boolean>(k(ws, "posts"), (posts) => {
      const list = posts ?? [];
      const next = list.filter((p) => p.id !== id);
      return next.length === list.length ? null : { value: next, result: true };
    })) ?? false
  );
}

export async function saveMedia(
  ws: string,
  data: Buffer,
  contentType: string,
  base: string,
  meta: Pick<MediaItem, "prompt" | "title" | "text"> = {},
): Promise<MediaItem> {
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const key = `${ws}-${newId()}.${ext}`;
  const stored = await getStorage().putMedia(key, data, contentType, base);
  return { id: key, url: stored.url, contentType, createdAt: new Date().toISOString(), ...meta };
}

async function overwrite<T>(key: string, value: T) {
  await mutate<T, true>(key, () => ({ value, result: true }));
}

export async function getMetaConnection(ws: string) {
  return readJSON<MetaConnection>(k(ws, "connection-meta"));
}

export async function saveMetaConnection(ws: string, input: Omit<MetaConnection, "pageTokenEnc" | "connectedAt"> & { pageToken: string }) {
  const { pageToken, ...rest } = input;
  const connection: MetaConnection = { ...rest, pageTokenEnc: encrypt(pageToken), connectedAt: new Date().toISOString() };
  await overwrite(k(ws, "connection-meta"), connection);
  return connection;
}

export async function clearMetaConnection(ws: string) {
  await overwrite<MetaConnection | null>(k(ws, "connection-meta"), null);
}

export async function getMetaPending<T>(ws: string) {
  return readJSON<T>(k(ws, "meta-pending"));
}

export async function setMetaPending<T>(ws: string, value: T | null) {
  await overwrite(k(ws, "meta-pending"), value);
}

export const DEFAULT_SETTINGS: StudioSettings = {
  routes: { instagram: "direct", facebook: "direct", linkedin: "n8n", tiktok: "n8n", x: "n8n" },
  defaultMode: "approval",
};

export async function getSettings(ws: string): Promise<StudioSettings> {
  const saved = await readJSON<StudioSettings>(k(ws, "settings"));
  return { ...DEFAULT_SETTINGS, ...saved, routes: { ...DEFAULT_SETTINGS.routes, ...saved?.routes } };
}

export async function saveSettings(ws: string, settings: StudioSettings) {
  await overwrite(k(ws, "settings"), settings);
}
