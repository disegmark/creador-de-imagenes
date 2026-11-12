import { encrypt, newId } from "./crypto";
import { getStorage } from "./storage";
import type { MediaItem, MetaConnection, Post, StudioSettings } from "./types";

const POSTS_KEY = "posts";
const META_KEY = "connection-meta";
const SETTINGS_KEY = "settings";
const MAX_POSTS = 500;

// Serializa escrituras dentro del mismo proceso para no pisar cambios.
let chain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export async function listPosts(): Promise<Post[]> {
  return (await getStorage().getJSON<Post[]>(POSTS_KEY)) ?? [];
}

export async function getPost(id: string) {
  return (await listPosts()).find((p) => p.id === id) ?? null;
}

export function createPost(input: Omit<Post, "id" | "createdAt" | "updatedAt" | "results"> & { results?: Post["results"] }) {
  return serialized(async () => {
    const now = new Date().toISOString();
    const post: Post = { ...input, results: input.results ?? [], id: newId(), createdAt: now, updatedAt: now };
    const posts = await listPosts();
    await getStorage().setJSON(POSTS_KEY, [post, ...posts].slice(0, MAX_POSTS));
    return post;
  });
}

export function updatePost(id: string, patch: (post: Post) => Partial<Post> | null) {
  return serialized(async () => {
    const posts = await listPosts();
    const index = posts.findIndex((p) => p.id === id);
    if (index === -1) return null;
    const changes = patch(posts[index]);
    if (!changes) return posts[index];
    const updated: Post = { ...posts[index], ...changes, id, updatedAt: new Date().toISOString() };
    posts[index] = updated;
    await getStorage().setJSON(POSTS_KEY, posts);
    return updated;
  });
}

export function deletePost(id: string) {
  return serialized(async () => {
    const posts = await listPosts();
    const next = posts.filter((p) => p.id !== id);
    await getStorage().setJSON(POSTS_KEY, next);
    return next.length !== posts.length;
  });
}

export async function saveMedia(
  data: Buffer,
  contentType: string,
  base: string,
  meta: Pick<MediaItem, "prompt" | "title" | "text"> = {},
): Promise<MediaItem> {
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : "png";
  const key = `${newId()}.${ext}`;
  const stored = await getStorage().putMedia(key, data, contentType, base);
  return { id: key, url: stored.url, contentType, createdAt: new Date().toISOString(), ...meta };
}

export async function getMetaConnection() {
  return getStorage().getJSON<MetaConnection>(META_KEY);
}

export async function saveMetaConnection(input: Omit<MetaConnection, "pageTokenEnc" | "connectedAt"> & { pageToken: string }) {
  const { pageToken, ...rest } = input;
  const connection: MetaConnection = { ...rest, pageTokenEnc: encrypt(pageToken), connectedAt: new Date().toISOString() };
  await getStorage().setJSON(META_KEY, connection);
  return connection;
}

export async function clearMetaConnection() {
  await getStorage().setJSON<MetaConnection | null>(META_KEY, null);
}

export const DEFAULT_SETTINGS: StudioSettings = {
  routes: { instagram: "direct", facebook: "direct", linkedin: "n8n", tiktok: "n8n", x: "n8n" },
  defaultMode: "approval",
};

export async function getSettings(): Promise<StudioSettings> {
  const saved = await getStorage().getJSON<StudioSettings>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...saved, routes: { ...DEFAULT_SETTINGS.routes, ...saved?.routes } };
}

export async function saveSettings(settings: StudioSettings) {
  await getStorage().setJSON(SETTINGS_KEY, settings);
}
