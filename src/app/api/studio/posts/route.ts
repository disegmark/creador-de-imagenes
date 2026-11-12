import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { listPosts } from "@/lib/studio/repo";
import { createPostFromInput, inputErrorResponse, readJson } from "@/lib/studio/service";
import type { PostStatus } from "@/lib/studio/types";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  const status = new URL(request.url).searchParams.get("status") as PostStatus | null;
  const posts = (await listPosts(ws.id)).filter((p) => !status || p.status === status);
  // Sin enlaces firmados en el listado: el de Carrusel Studio se pide aparte, por post.
  return Response.json({ posts: posts.map((p) => ({ ...p, igPending: undefined })) });
}

/**
 * Crea una publicación en el espacio de la sesión o de la clave de API
 * (Carrusel Studio, n8n o el Dashboard).
 *
 * { caption, media: [{url|dataUrl, title?, text?}], networks: ["instagram",...],
 *   mode: "approval" | "direct", scheduledAt?: ISO, format?: "4:5", draft?: boolean,
 *   source?: "carrusel" | "api" }
 */
export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  try {
    const body = await readJson(request);
    const source = body.source === "carrusel" ? "carrusel" : body.source === "studio" ? "studio" : "api";
    const post = await createPostFromInput(ws, body, request, source);
    return Response.json({ post }, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
