import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { carouselOpenUrl } from "@/lib/studio/handoff";
import { createPostFromInput, inputErrorResponse, readJson } from "@/lib/studio/service";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

/**
 * Envía imágenes generadas a Carrusel Studio: crea un borrador y devuelve
 * la URL (firmada, 24 h) para abrir Carrusel Studio con las imágenes precargadas.
 */
export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await authorize(request);
  if (!ws) return unauthorized();
  try {
    const body = await readJson(request);
    const post = await createPostFromInput(ws, { ...body, draft: true }, request, "studio");
    return Response.json({ post, openUrl: carouselOpenUrl(ws.id, post, request) }, { status: 201 });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
