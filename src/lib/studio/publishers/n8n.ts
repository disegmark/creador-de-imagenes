import { createHmac } from "node:crypto";
import { n8nFor, type Workspace } from "../workspaces";
import type { Network, Post, PublishResult } from "../types";

export function n8nSignature(body: string, secret: string) {
  return secret ? createHmac("sha256", secret).update(body).digest("hex") : "";
}

export async function postToN8n(url: string, secret: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Studio-Signature": n8nSignature(body, secret) },
    body,
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json().catch(() => null)) as unknown;
  return { ok: res.ok, status: res.status, json };
}

export function postPayload(ws: Workspace, post: Post, base: string) {
  return {
    workspace: ws.id,
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
 * Publica vía n8n. El workflow recibe { event: "publish", networks, post } y debe:
 *  - responder en el mismo request: { results: [{ network, ok, externalId?, permalink?, error? }] }
 *  - o responder 2xx y luego llamar a POST links.results con los resultados.
 * Una red sin resultado queda "pendiente de confirmación", NUNCA como publicada.
 */
export async function publishViaN8n(ws: Workspace, post: Post, networks: Network[], base: string): Promise<Array<Omit<PublishResult, "at">>> {
  const { publishUrl, secret } = n8nFor(ws);
  if (!publishUrl) {
    return networks.map((network) => ({ network, route: "n8n" as const, ok: false, error: "Webhook de n8n no configurado" }));
  }
  try {
    const { ok, status, json } = await postToN8n(publishUrl, secret, { event: "publish", networks, post: postPayload(ws, post, base) });
    if (!ok) return networks.map((network) => ({ network, route: "n8n" as const, ok: false, error: `n8n respondió ${status}` }));
    const results = (json as { results?: Array<Partial<PublishResult>> } | null)?.results;
    return networks.map((network) => {
      const r = Array.isArray(results) ? results.find((x) => x?.network === network) : undefined;
      if (!r) return { network, route: "n8n" as const, ok: false, pending: true };
      return {
        network,
        route: "n8n" as const,
        ok: r.ok === true,
        pending: r.ok !== true && r.pending === true ? true : undefined,
        externalId: typeof r.externalId === "string" ? r.externalId : undefined,
        permalink: typeof r.permalink === "string" ? r.permalink : undefined,
        error: typeof r.error === "string" ? r.error : undefined,
      };
    });
  } catch (error) {
    // Error de red / timeout: no sabemos si n8n llegó a publicar → pendiente, no se reenvía solo.
    return networks.map((network) => ({ network, route: "n8n" as const, ok: false, pending: true, error: `Sin respuesta de n8n: ${(error as Error).message}` }));
  }
}

/** Avisa a n8n de que hay un post esperando aprobación (para mandarlo por WhatsApp, email, Slack…). */
export async function notifyApprovalNeeded(ws: Workspace, post: Post, base: string) {
  const { approvalUrl, secret } = n8nFor(ws);
  if (!approvalUrl) return;
  try {
    await postToN8n(approvalUrl, secret, { event: "approval_requested", post: postPayload(ws, post, base) });
  } catch (error) {
    console.error("[studio] approval notification failed", error);
  }
}
