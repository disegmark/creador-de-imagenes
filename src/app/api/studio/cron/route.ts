import { hasApiKey } from "@/lib/studio/auth";
import { isStudioEnabled, publicBase, studioConfig } from "@/lib/studio/config";
import { safeEqual } from "@/lib/studio/crypto";
import { isDue, publishPost } from "@/lib/studio/publish";
import { listPosts } from "@/lib/studio/repo";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  if (hasApiKey(request)) return true;
  const header = request.headers.get("authorization") ?? "";
  return Boolean(studioConfig.cronSecret) && safeEqual(header, `Bearer ${studioConfig.cronSecret}`);
}

/**
 * Publica los posts aprobados cuya hora programada ya llegó.
 * Llamar cada 5 min desde n8n (Schedule Trigger → HTTP Request) o Vercel Cron.
 */
async function run(request: Request) {
  if (!isStudioEnabled()) return Response.json({ error: "studio_not_configured" }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const due = (await listPosts()).filter((p) => p.status === "approved" && isDue(p));
  const base = publicBase(request);
  const published = [];
  for (const post of due) {
    const result = await publishPost(post.id, base);
    published.push({ id: post.id, status: result?.status });
  }
  return Response.json({ processed: published.length, posts: published });
}

export const GET = run;
export const POST = run;
