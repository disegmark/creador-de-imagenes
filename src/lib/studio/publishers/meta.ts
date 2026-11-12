import { studioConfig } from "../config";
import { decrypt } from "../crypto";
import { getMetaConnection } from "../repo";
import type { Post, PublishResult } from "../types";

type GraphResponse = { id?: string; post_id?: string; status_code?: string; permalink?: string; permalink_url?: string; error?: { message?: string } };

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

/** Credenciales efectivas: conexión OAuth hecha desde el Dashboard o, si no, variables de entorno. */
export async function resolveMetaCredentials() {
  const conn = await getMetaConnection();
  if (conn?.pageTokenEnc) {
    return { source: "oauth" as const, pageId: conn.pageId, pageName: conn.pageName, token: decrypt(conn.pageTokenEnc), igUserId: conn.igUserId, igUsername: conn.igUsername };
  }
  if (studioConfig.metaPageToken && (studioConfig.metaPageId || studioConfig.metaIgUserId)) {
    return { source: "env" as const, pageId: studioConfig.metaPageId, pageName: "", token: studioConfig.metaPageToken, igUserId: studioConfig.metaIgUserId || undefined, igUsername: undefined };
  }
  return null;
}

async function waitUntilReady(containerId: string, token: string) {
  for (let i = 0; i < 20; i += 1) {
    const { status_code } = await graph(containerId, { fields: "status_code", access_token: token }, "GET");
    if (status_code === "FINISHED" || !status_code) return;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`Instagram no pudo procesar la imagen (${status_code})`);
    await sleep(1500);
  }
  throw new Error("Instagram tardó demasiado en procesar las imágenes");
}

export async function publishInstagram(post: Post): Promise<Omit<PublishResult, "at">> {
  const creds = await resolveMetaCredentials();
  if (!creds?.igUserId) return { network: "instagram", route: "direct", ok: false, error: "Instagram no está conectado" };
  const { igUserId, token } = creds;
  const media = post.media.slice(0, 10);
  try {
    let creationId: string;
    if (media.length === 1) {
      const c = await graph(`${igUserId}/media`, { image_url: media[0].url, caption: post.caption, access_token: token });
      creationId = c.id!;
    } else {
      const children: string[] = [];
      for (const item of media) {
        const c = await graph(`${igUserId}/media`, { image_url: item.url, is_carousel_item: "true", access_token: token });
        children.push(c.id!);
      }
      for (const child of children) await waitUntilReady(child, token);
      const parent = await graph(`${igUserId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption, access_token: token });
      creationId = parent.id!;
    }
    await waitUntilReady(creationId, token);
    const published = await graph(`${igUserId}/media_publish`, { creation_id: creationId, access_token: token });
    let permalink: string | undefined;
    try {
      permalink = (await graph(published.id!, { fields: "permalink", access_token: token }, "GET")).permalink;
    } catch {
      /* el permalink es opcional */
    }
    return { network: "instagram", route: "direct", ok: true, externalId: published.id, permalink };
  } catch (error) {
    return { network: "instagram", route: "direct", ok: false, error: (error as Error).message };
  }
}

export async function publishFacebook(post: Post): Promise<Omit<PublishResult, "at">> {
  const creds = await resolveMetaCredentials();
  if (!creds?.pageId) return { network: "facebook", route: "direct", ok: false, error: "Página de Facebook no conectada" };
  const { pageId, token } = creds;
  try {
    let postId: string | undefined;
    if (post.media.length === 1) {
      const r = await graph(`${pageId}/photos`, { url: post.media[0].url, caption: post.caption, access_token: token });
      postId = r.post_id ?? r.id;
    } else {
      const ids: string[] = [];
      for (const item of post.media) {
        const r = await graph(`${pageId}/photos`, { url: item.url, published: "false", access_token: token });
        ids.push(r.id!);
      }
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

// ---- OAuth desde el Dashboard ----

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
  const short = await graph(
    "oauth/access_token",
    { client_id: studioConfig.metaAppId, client_secret: studioConfig.metaAppSecret, redirect_uri: redirectUri, code },
    "GET",
  ) as GraphResponse & { access_token?: string };
  const long = await graph(
    "oauth/access_token",
    { grant_type: "fb_exchange_token", client_id: studioConfig.metaAppId, client_secret: studioConfig.metaAppSecret, fb_exchange_token: short.access_token! },
    "GET",
  ) as GraphResponse & { access_token?: string };
  const userToken = long.access_token!;
  const me = (await graph("me", { fields: "name", access_token: userToken }, "GET")) as GraphResponse & { name?: string };
  const res = await fetch(
    `${graphBase()}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token,instagram_business_account{id,username}", access_token: userToken })}`,
    { cache: "no-store" },
  );
  const json = (await res.json()) as { data?: PageAccount[]; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? "No se pudieron leer las páginas");
  return { userName: me.name, pages: json.data ?? [] };
}
