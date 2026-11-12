import { apiKeyWorkspace } from "@/lib/studio/auth";
import { publicBase, studioConfig } from "@/lib/studio/config";
import { safeEqual } from "@/lib/studio/crypto";
import { isDue, isStalePublishing, publishPost } from "@/lib/studio/publish";
import { listPosts } from "@/lib/studio/repo";
import { getWorkspaces, isStudioEnabled, type Workspace } from "@/lib/studio/workspaces";

export const runtime = "nodejs";
export const maxDuration = 300;

/** CRON_SECRET → todos los espacios; clave de API de un espacio → solo ese espacio. */
function scope(request: Request): Workspace[] | null {
  const header = request.headers.get("authorization") ?? "";
  if (studioConfig.cronSecret && safeEqual(header, `Bearer ${studioConfig.cronSecret}`)) return getWorkspaces();
  const ws = apiKeyWorkspace(request);
  return ws ? [ws] : null;
}

/**
 * Publica lo aprobado cuya hora ya llegó, retoma posts cortados en "publicando"
 * y termina las publicaciones de Instagram que quedaron procesando.
 * Llamar cada 5 min desde n8n (Schedule Trigger → HTTP Request) o un cron del servidor.
 */
async function run(request: Request) {
  if (!isStudioEnabled()) return Response.json({ error: "studio_not_configured" }, { status: 503 });
  const workspaces = scope(request);
  if (!workspaces) return Response.json({ error: "unauthorized" }, { status: 401 });
  const base = publicBase(request);
  const processed: Array<{ workspace: string; id: string; status?: string }> = [];
  for (const ws of workspaces) {
    const posts = await listPosts(ws.id);
    const work = posts.filter((p) => (p.status === "approved" && isDue(p)) || isStalePublishing(p) || (p.status === "sent" && p.igPending));
    for (const post of work) {
      const result = await publishPost(ws, post.id, base);
      processed.push({ workspace: ws.id, id: post.id, status: result?.status });
    }
  }
  return Response.json({ processed: processed.length, posts: processed });
}

export const GET = run;
export const POST = run;
