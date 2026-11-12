import { studioConfig } from "../config";
import { decrypt } from "../crypto";
import { getMetaConnection } from "../repo";
import type { Post, PublishResult } from "../types";

type GraphResponse = {
  id?: string;
  post_id?: string;
  status_code?: string;
  permalink?: string;
  permalink_url?: string;
  access_token?: string;
  name?: string;
  error?: { message?: string };
};

const graphBase = () => `https://graph.facebook.com/${studioConfig.metaGraphVersion}`;

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<GraphResponse> {
  const body = new URLSearchParams(params);
  const url = method === "GET" ? `${graphBase()}/${path}?${body}` : `${graphBase()}/${path}`;
  const res = await fetch(url, method === "GET" ? { cache: "no-store" } : { method, body });
  const json = (await res.json().catch(() => ({}))) as GraphResponse;
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `Meta Graph ${res.status}`);
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Credenciales del espacio: conexión OAuth hecha desde el panel o, si no, variables de entorno (solo espacio "principal"). */
export async function resolveMetaCredentials(ws: string) {
  const conn = await getMetaConnection(ws);
  if (conn?.pageTokenEnc) {
    let token: string;
    try {
      token = decrypt(conn.pageTokenEnc);
    } catch {
      throw new Error("La conexión de Meta guardada no se puede leer (¿cambió STUDIO_SECRET?). Vuelve a conectar en Conexiones.");
    }
    return { source: "oauth" as const, pageId: conn.pageId, pageName: conn.pageName, token, igUserId: conn.igUserId, igUsername: conn.igUsername };
  }
  if (ws === "principal" && studioConfig.metaPageToken && (studioConfig.metaPageId || studioConfig.metaIgUserId)) {
    return { source: "env" as const, pageId: studioConfig.metaPageId, pageName: "", token: studioConfig.metaPageToken, igUserId: studioConfig.metaIgUserId || undefined, igUsername: undefined };
  }
  return null;
}

/** Estado de un contenedor de Instagram: listo, en proceso o error. */
async function containerStatus(id: string, token: string) {
  const { status_code } = await graph(id, { fields: "status_code", access_token: token }, "GET");
  if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`Instagram no pudo procesar la imagen (${status_code})`);
  return status_code === "FINISHED" || !status_code ? "ready" : "processing";
}

/** Espera a que todos los contenedores estén listos, sin pasar del plazo. */
async function waitAll(ids: string[], token: string, deadline: number) {
  let pending = [...ids];
  while (pending.length) {
    const states = await Promise.all(pending.map((id) => containerStatus(id, token)));
    pending = pending.filter((_, i) => states[i] !== "ready");
    if (!pending.length) return true;
    if (Date.now() + 3000 > deadline) return false;
    await sleep(3000);
  }
  return true;
}

export type InstagramOutcome = { result: Omit<PublishResult, "at">; igPending: Post["igPending"] };

/**
 * Publica en Instagram. Los contenedores se crean en paralelo y se espera como
 * máximo hasta `deadline`. Si Instagram sigue procesando, se guardan los
 * contenedores (igPending) y la publicación se completa en la siguiente pasada
 * (cron o "Reintentar"), sin volver a subir las imágenes.
 */
export async function publishInstagram(ws: string, post: Post, deadline: number): Promise<InstagramOutcome> {
  const fail = (error: string): InstagramOutcome => ({ result: { network: "instagram", route: "direct", ok: false, error }, igPending: null });
  try {
    const creds = await resolveMetaCredentials(ws);
    if (!creds?.igUserId) return fail("Instagram no está conectado");
    const { igUserId, token } = creds;
    const media = post.media.slice(0, 10);

    // Los contenedores de Instagram caducan a las 24 h.
    const resume = post.igPending && Date.now() - new Date(post.igPending.createdAt).getTime() < 23 * 3600 * 1000 ? post.igPending : null;
    const createdAt = resume?.createdAt ?? new Date().toISOString();
    let creationId = resume?.creationId;
    let childIds = resume?.childIds;

    if (!creationId) {
      if (media.length === 1) {
        creationId = (await graph(`${igUserId}/media`, { image_url: media[0].url, caption: post.caption, access_token: token })).id!;
      } else {
        childIds ??= await Promise.all(
          media.map(async (item) => (await graph(`${igUserId}/media`, { image_url: item.url, is_carousel_item: "true", access_token: token })).id!),
        );
        if (!(await waitAll(childIds, token, deadline))) {
          return { result: { network: "instagram", route: "direct", ok: false, pending: true, error: "Instagram sigue procesando las imágenes" }, igPending: { childIds, createdAt } };
        }
        creationId = (await graph(`${igUserId}/media`, { media_type: "CAROUSEL", children: childIds.join(","), caption: post.caption, access_token: token })).id!;
      }
    }

    if (!(await waitAll([creationId], token, deadline))) {
      return { result: { network: "instagram", route: "direct", ok: false, pending: true, error: "Instagram sigue procesando la publicación" }, igPending: { creationId, childIds, createdAt } };
    }
    const published = await graph(`${igUserId}/media_publish`, { creation_id: creationId, access_token: token });
    let permalink: string | undefined;
    try {
      permalink = (await graph(published.id!, { fields: "permalink", access_token: token }, "GET")).permalink;
    } catch {
      /* el permalink es opcional */
    }
    return { result: { network: "instagram", route: "direct", ok: true, externalId: published.id, permalink }, igPending: null };
  } catch (error) {
    return fail((error as Error).message);
  }
}

export async function publishFacebook(ws: string, post: Post): Promise<Omit<PublishResult, "at">> {
  try {
    const creds = await resolveMetaCredentials(ws);
    if (!creds?.pageId) return { network: "facebook", route: "direct", ok: false, error: "Página de Facebook no conectada" };
    const { pageId, token } = creds;
    let postId: string | undefined;
    if (post.media.length === 1) {
      const r = await graph(`${pageId}/photos`, { url: post.media[0].url, caption: post.caption, access_token: token });
      postId = r.post_id ?? r.id;
    } else {
      const ids = await Promise.all(post.media.map(async (item) => (await graph(`${pageId}/photos`, { url: item.url, published: "false", access_token: token })).id!));
      const r = await graph(`${pageId}/feed`, {
        message: post.caption,
        attached_media: JSON.stringify(ids.map((id) => ({ media_fbid: id }))),
        access_token: token,
      });
      postId = r.id;
    }
    let permalink: string | undefined;
    try {
      if (postId) permalink = (await graph(postId, { fields: "permalink_url", access_token: token }, "GET")).permalink_url;
    } catch {
      /* opcional */
    }
    return { network: "facebook", route: "direct", ok: true, externalId: postId, permalink };
  } catch (error) {
    return { network: "facebook", route: "direct", ok: false, error: (error as Error).message };
  }
}

// ---- OAuth desde el panel ----

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

export function metaAuthUrl(redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: studioConfig.metaAppId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  });
  return `https://www.facebook.com/${studioConfig.metaGraphVersion}/dialog/oauth?${params}`;
}

type PageAccount = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };

/** Intercambia el code por un token de larga duración y devuelve las páginas (con su IG vinculado). */
export async function exchangeMetaCode(code: string, redirectUri: string) {
  const short = await graph("oauth/access_token", { client_id: studioConfig.metaAppId, client_secret: studioConfig.metaAppSecret, redirect_uri: redirectUri, code }, "GET");
  const long = await graph(
    "oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: studioConfig.metaAppId, client_secret: studioConfig.metaAppSecret, fb_exchange_token: short.access_token! },
    "GET",
  );
  const userToken = long.access_token!;
  const me = await graph("me", { fields: "name", access_token: userToken }, "GET");
  const res = await fetch(
    `${graphBase()}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,instagram_business_account{id,username}", access_token: userToken })}`,
    { cache: "no-store" },
  );
  const json = (await res.json()) as { data?: PageAccount[]; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? "No se pudieron leer las páginas");
  return { userName: me.name, pages: json.data ?? [] };
}
