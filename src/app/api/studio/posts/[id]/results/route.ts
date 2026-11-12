import { hasApiKey, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";
import { statusFrom } from "@/lib/studio/publish";
import { updatePost } from "@/lib/studio/repo";
import { isNetwork, type PublishResult } from "@/lib/studio/types";

export const runtime = "nodejs";

/**
 * Callback de n8n: { results: [{ network, ok, externalId?, permalink?, error? }] }.
 * Requiere Authorization: Bearer STUDIO_API_KEY.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  if (!hasApiKey(request)) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { results?: unknown };
  if (!Array.isArray(body.results)) return Response.json({ error: "results_required" }, { status: 422 });
  const at = new Date().toISOString();
  const incoming: PublishResult[] = (body.results as Array<Record<string, unknown>>)
    .filter((r) => isNetwork(r?.network))
    .map((r) => ({
      network: r.network as PublishResult["network"],
      route: "n8n",
      ok: Boolean(r.ok),
      externalId: typeof r.externalId === "string" ? r.externalId : undefined,
      permalink: typeof r.permalink === "string" ? r.permalink : undefined,
      error: typeof r.error === "string" ? r.error : undefined,
      at,
    }));
  const post = await updatePost((await ctx.params).id, (p) => {
    const results = [...p.results.filter((r) => !incoming.some((i) => i.network === r.network)), ...incoming];
    return { results, status: statusFrom(p.networks, results) };
  });
  return post ? Response.json({ post }) : Response.json({ error: "not_found" }, { status: 404 });
}
