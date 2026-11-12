import { apiKeyWorkspace, notConfigured, unauthorized } from "@/lib/studio/auth";
import { statusFrom } from "@/lib/studio/publish";
import { updatePost } from "@/lib/studio/repo";
import { inputErrorResponse } from "@/lib/studio/service";
import { isNetwork, type PublishResult } from "@/lib/studio/types";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

/**
 * Callback de n8n: { results: [{ network, ok, externalId?, permalink?, error? }] }.
 * Requiere Authorization: Bearer <api_key del espacio>.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = apiKeyWorkspace(request);
  if (!ws) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { results?: unknown };
  if (!Array.isArray(body.results)) return Response.json({ error: "results_required" }, { status: 422 });
  const at = new Date().toISOString();
  const incoming: PublishResult[] = (body.results as Array<Record<string, unknown>>)
    .filter((r) => isNetwork(r?.network))
    .map((r) => ({
      network: r.network as PublishResult["network"],
      route: "n8n",
      ok: r.ok === true,
      pending: r.ok !== true && r.pending === true ? true : undefined,
      externalId: typeof r.externalId === "string" ? r.externalId : undefined,
      permalink: typeof r.permalink === "string" ? r.permalink : undefined,
      error: typeof r.error === "string" ? r.error : undefined,
      at,
    }));
  try {
    const post = await updatePost(ws.id, (await ctx.params).id, (p) => {
      if (p.status === "publishing") return null; // se aplica cuando termine la pasada en curso
      const valid = incoming.filter((i) => p.networks.includes(i.network));
      const results = [...p.results.filter((r) => !valid.some((i) => i.network === r.network)), ...valid];
      return { results, status: statusFrom(p.networks, results) };
    });
    if (!post) return Response.json({ error: "not_found" }, { status: 404 });
    if (post.status === "publishing") return Response.json({ error: "busy_retry_later" }, { status: 409 });
    return Response.json({ post });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
