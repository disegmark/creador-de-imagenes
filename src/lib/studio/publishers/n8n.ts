import { createHmac } from "node:crypto";
import { studioConfig } from "../config";
import type { Network, Post, PublishResult } from "../types";

export function n8nSignature(body: string) {
  return studioConfig.n8nSecret ? createHmac("sha256", studioConfig.n8nSecret).update(body).digest("hex") : "";
}

export async function postToN8n(url: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Studio-Signature": n8nSignature(body) },
    body,
  });
  const json = (await res.json().catch(() => null)) as unknown;
  return { ok: res.ok, status: res.status, json };
}

export function postPayload(post: Post, base: string) {
  return {
    id: post.id,
    caption: post.caption,
    format: post.format,
    networks: post.networks,
    isCarousel: post.media.length > 1,
    images: post.media.map((m, i) => ({ position: i + 1, url: m.url, title: m.title ?? "", text: m.text ?? "" })),
    scheduledAt: post.scheduledAt ?? null,
    links: {
      approve: `${base}/api/studio/posts/${post.id}/approve`,
      reject: `${base}/api/studio/posts/${post.id}/reject`,
      results: `${base}/api/studio/posts/${post.id}/results`,
      panel: `${base}/studio?post=${post.id}`,
    },
  };
}

/**
 * Publica vía n8n. El workflow recibe { event: "publish", networks, post } y puede:
 *  - responder en el mismo request: { results: [{ network, ok, externalId?, permalink?, error? }] }
 *  - o responder 200 y luego llamar a POST /api/studio/posts/:id/results con los resultados.
 */
export async function publishViaN8n(post: Post, networks: Network[], base: string): Promise<Array<Omit<PublishResult, "at">>> {
  if (!studioConfig.n8nPublishUrl) {
    return networks.map((network) => ({ network, route: "n8n" as const, ok: false, error: "N8N_PUBLISH_WEBHOOK_URL no configurada" }));
  }
  try {
    const { ok, status, json } = await postToN8n(studioConfig.n8nPublishUrl, { event: "publish", networks, post: postPayload(post, base) });
    if (!ok) return networks.map((network) => ({ network, route: "n8n" as const, ok: false, error: `n8n respondió ${status}` }));
    const results = (json as { results?: Array<Partial<PublishResult>> } | null)?.results;
    return networks.map((network) => {
      const r = results?.find((x) => x.network === network);
      return r
        ? { network, route: "n8n" as const, ok: Boolean(r.ok), externalId: r.externalId, permalink: r.permalink, error: r.error }
        : { network, route: "n8n" as const, ok: true, externalId: "enviado-a-n8n" };
    });
  } catch (error) {
    return networks.map((network) => ({ network, route: "n8n" as const, ok: false, error: (error as Error).message }));
  }
}

/** Avisa a n8n de que hay un post esperando aprobación (para mandarlo por WhatsApp, email, Slack…). */
export async function notifyApprovalNeeded(post: Post, base: string) {
  if (!studioConfig.n8nApprovalUrl) return;
  try {
    await postToN8n(studioConfig.n8nApprovalUrl, { event: "approval_requested", post: postPayload(post, base) });
  } catch (error) {
    console.error("[studio] approval notification failed", error);
  }
}
