import { isAuthorized, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";
import { carouselOpenUrl, handoffFeedUrl } from "@/lib/studio/handoff";
import { createPostFromInput, inputErrorResponse, readJson } from "@/lib/studio/service";

export const runtime = "nodejs";

/**
 * Envía imágenes generadas a Carrusel Studio: crea un borrador y devuelve
 * la URL para abrir Carrusel Studio con las imágenes precargadas.
 */
export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await isAuthorized(request))) return unauthorized();
  try {
    const body = await readJson(request);
    const post = await createPostFromInput({ ...body, draft: true }, request, "studio");
    return Response.json({ post, openUrl: carouselOpenUrl(post, request), feedUrl: handoffFeedUrl(post, request) }, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
