import { publicBase, studioConfig } from "./config";
import { safeEqual, sign } from "./crypto";
import type { Post } from "./types";

/** Firma del enlace de intercambio con Carrusel Studio (no requiere API key en el navegador). */
export function handoffSig(postId: string) {
  return sign(`handoff:${postId}`).slice(0, 32);
}

export function verifyHandoff(postId: string, sig: string | null) {
  return Boolean(sig) && safeEqual(handoffSig(postId), sig!);
}

export function handoffFeedUrl(post: Post, request: Request) {
  return `${publicBase(request)}/api/studio/handoff/${post.id}?sig=${handoffSig(post.id)}`;
}

/** URL para abrir Carrusel Studio con las imágenes ya cargadas. */
export function carouselOpenUrl(post: Post, request: Request) {
  const feed = handoffFeedUrl(post, request);
  return `${studioConfig.carruselUrl}/?importar=${encodeURIComponent(feed)}`;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = [studioConfig.carruselUrl, ...(process.env.STUDIO_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}
