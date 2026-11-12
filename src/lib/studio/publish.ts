import { getPost, getSettings, updatePost } from "./repo";
import { publishFacebook, publishInstagram } from "./publishers/meta";
import { publishViaN8n } from "./publishers/n8n";
import { NETWORKS, type Network, type Post, type PostStatus, type PublishResult, type Route } from "./types";

export async function routeFor(network: Network): Promise<Route> {
  const def = NETWORKS.find((n) => n.key === network);
  if (!def?.direct) return "n8n";
  return (await getSettings()).routes[network] ?? "direct";
}

/** Publica un post en todas sus redes (directo o n8n según la configuración) y guarda los resultados. */
export async function publishPost(id: string, base: string): Promise<Post | null> {
  // Bloqueo optimista: solo un proceso pasa de approved/failed → publishing.
  let claimed = false;
  await updatePost(id, (p) => {
    if (!["approved", "failed", "partial"].includes(p.status)) return null;
    claimed = true;
    return { status: "publishing" };
  });
  const post = await getPost(id);
  if (!post || !claimed) return post;

  // En un reintento solo se publican las redes que fallaron.
  const done = new Set(post.results.filter((r) => r.ok).map((r) => r.network));
  const pending = post.networks.filter((n) => !done.has(n));

  const direct: Network[] = [];
  const viaN8n: Network[] = [];
  for (const network of pending) ((await routeFor(network)) === "direct" ? direct : viaN8n).push(network);

  const raw: Array<Omit<PublishResult, "at">> = [];
  for (const network of direct) {
    raw.push(network === "instagram" ? await publishInstagram(post) : await publishFacebook(post));
  }
  if (viaN8n.length) raw.push(...(await publishViaN8n(post, viaN8n, base)));

  const at = new Date().toISOString();
  const fresh = raw.map((r) => ({ ...r, at }));

  return updatePost(id, (p) => {
    const kept = p.results.filter((r) => r.ok && !fresh.some((f) => f.network === r.network));
    const results = [...kept, ...fresh];
    return { results, status: statusFrom(p.networks, results) };
  });
}

export function statusFrom(networks: Network[], results: PublishResult[]): PostStatus {
  const ok = networks.filter((n) => results.some((r) => r.network === n && r.ok)).length;
  if (ok === networks.length) return "published";
  return ok === 0 ? "failed" : "partial";
}

export function isDue(post: Post, now = Date.now()) {
  return !post.scheduledAt || new Date(post.scheduledAt).getTime() <= now;
}
