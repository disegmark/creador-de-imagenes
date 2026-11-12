import { getPost, getSettings, updatePost } from "./repo";
import { publishFacebook, publishInstagram } from "./publishers/meta";
import { publishViaN8n } from "./publishers/n8n";
import { NETWORKS, type Network, type Post, type PostStatus, type PublishResult, type Route } from "./types";
import type { Workspace } from "./workspaces";

/** Un post que lleva más de esto en "publicando" se considera cortado y se puede retomar. */
export const STALE_PUBLISHING_MS = 10 * 60 * 1000;
/** Tiempo máximo que se espera a Instagram dentro de una misma petición. */
const INSTAGRAM_BUDGET_MS = 150_000;

export async function routeFor(ws: string, network: Network): Promise<Route> {
  const def = NETWORKS.find((n) => n.key === network);
  if (!def?.direct) return "n8n";
  return (await getSettings(ws)).routes[network] ?? "direct";
}

export function isStalePublishing(post: Post, now = Date.now()) {
  return post.status === "publishing" && now - new Date(post.updatedAt).getTime() > STALE_PUBLISHING_MS;
}

function claimable(post: Post) {
  if (["approved", "failed", "partial"].includes(post.status)) return true;
  if (isStalePublishing(post)) return true;
  // "sent" solo se retoma si hay contenedores de Instagram por terminar.
  return post.status === "sent" && Boolean(post.igPending);
}

/**
 * Publica un post en sus redes (directo o n8n) y guarda los resultados.
 * - Solo un proceso a la vez puede pasar a "publishing" (escritura con versión).
 * - Pase lo que pase, el post sale de "publishing" (try/finally).
 * - En un reintento solo se publican las redes que fallaron; las pendientes de
 *   confirmación no se reenvían (evita duplicados), salvo Instagram reanudable.
 */
export async function publishPost(ws: Workspace, id: string, base: string): Promise<Post | null> {
  let claimed = false;
  const post = await updatePost(ws.id, id, (p) => {
    claimed = false; // la función puede repetirse si hubo un cambio simultáneo
    if (!claimable(p)) return null;
    claimed = true;
    return { status: "publishing" };
  });
  if (!post || !claimed) return post ?? (await getPost(ws.id, id));

  const fresh: PublishResult[] = [];
  let igPending: Post["igPending"] = post.igPending ?? null;
  const stamp = (r: Omit<PublishResult, "at">) => fresh.push({ ...r, at: new Date().toISOString() });

  try {
    const done = new Set(post.results.filter((r) => r.ok).map((r) => r.network));
    const waiting = new Set(post.results.filter((r) => r.pending).map((r) => r.network));
    const pending = post.networks.filter((n) => !done.has(n) && (!waiting.has(n) || (n === "instagram" && post.igPending)));

    const direct: Network[] = [];
    const viaN8n: Network[] = [];
    for (const network of pending) ((await routeFor(ws.id, network)) === "direct" ? direct : viaN8n).push(network);

    const deadline = Date.now() + INSTAGRAM_BUDGET_MS;
    await Promise.all(
      direct.map(async (network) => {
        if (network === "instagram") {
          const outcome = await publishInstagram(ws.id, post, deadline);
          igPending = outcome.igPending;
          stamp(outcome.result);
        } else {
          stamp(await publishFacebook(ws.id, post));
        }
      }),
    );
    if (viaN8n.length) (await publishViaN8n(ws, post, viaN8n, base)).forEach(stamp);
  } catch (error) {
    // Error inesperado (almacenamiento, configuración…): las redes sin resultado quedan como fallidas.
    console.error("[studio/publish]", error);
    for (const network of post.networks) {
      if (!fresh.some((r) => r.network === network) && !post.results.some((r) => r.network === network && (r.ok || r.pending))) {
        stamp({ network, route: "direct", ok: false, error: (error as Error).message || "Error inesperado" });
      }
    }
  } finally {
    await updatePost(ws.id, id, (p) => {
      const results = [...p.results.filter((r) => !fresh.some((f) => f.network === r.network)), ...fresh];
      return { results, status: statusFrom(p.networks, results), igPending };
    });
  }
  return getPost(ws.id, id);
}

export function statusFrom(networks: Network[], results: PublishResult[]): PostStatus {
  const of = (n: Network) => results.find((r) => r.network === n);
  const ok = networks.filter((n) => of(n)?.ok).length;
  const waiting = networks.filter((n) => !of(n)?.ok && of(n)?.pending).length;
  const failed = networks.length - ok - waiting;
  if (ok === networks.length) return "published";
  if (failed === 0) return "sent"; // todo entregado, falta confirmar
  return ok === 0 && waiting === 0 ? "failed" : "partial";
}

export function isDue(post: Post, now = Date.now()) {
  return !post.scheduledAt || new Date(post.scheduledAt).getTime() <= now;
}
