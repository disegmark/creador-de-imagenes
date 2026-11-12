import { isAuthorized, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";
import { carouselOpenUrl } from "@/lib/studio/handoff";
import { listPosts } from "@/lib/studio/repo";
import { createPostFromInput, inputErrorResponse, readJson } from "@/lib/studio/service";
import type { PostStatus } from "@/lib/studio/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await isAuthorized(request))) return unauthorized();
  const status = new URL(request.url).searchParams.get("status") as PostStatus | null;
  const posts = (await listPosts()).filter((p) => !status || p.status === status);
  return Response.json({ posts: posts.map((p) => ({ ...p, carouselUrl: carouselOpenUrl(p, request) })) });
}

/**
 * Crea una publicación. Lo usa el panel del Studio y también, con
 * Authorization: Bearer STUDIO_API_KEY, Carrusel Studio, n8n o el Dashboard 360.
 *
 * { caption, media: [{url|dataUrl, title?, text?}], networks: ["instagram",...],
 *   mode: "approval" | "direct", scheduledAt?: ISO, format?: "4:5", draft?: boolean,
 *   source?: "carrusel" | "api" }
 */
export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await isAuthorized(request))) return unauthorized();
  try {
    const body = await readJson(request);
    const source = body.source === "carrusel" ? "carrusel" : body.source === "studio" ? "studio" : "api";
    const post = await createPostFromInput(body, request, source);
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
