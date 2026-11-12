import { publicBase, studioConfig } from "./config";
import { safeEqual, sign } from "./crypto";
import type { Post } from "./types";

/** El enlace con Carrusel Studio caduca: solo sirve mientras se edita el carrusel. */
export const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;

function handoffSig(ws: string, postId: string, exp: number) {
  return sign(`handoff:v2:${ws}:${postId}:${exp}`).slice(0, 43);
}

/** Parámetros firmados del enlace: espacio + post + caducidad. */
export function handoffQuery(ws: string, postId: string, now = Date.now()) {
  const exp = now + HANDOFF_TTL_MS;
  return new URLSearchParams({ w: ws, exp: String(exp), sig: handoffSig(ws, postId, exp) }).toString();
}

export function verifyHandoff(postId: string, params: URLSearchParams): string | null {
  const ws = params.get("w") ?? "";
  const exp = Number(params.get("exp"));
  const sig = params.get("sig") ?? "";
  if (!ws || !Number.isFinite(exp) || exp < Date.now() || exp > Date.now() + HANDOFF_TTL_MS + 60_000) return null;
  return safeEqual(handoffSig(ws, postId, exp), sig) ? ws : null;
}

export function handoffFeedUrl(ws: string, post: Post, request: Request) {
  return `${publicBase(request)}/api/studio/handoff/${post.id}?${handoffQuery(ws, post.id)}`;
}

/** URL para abrir Carrusel Studio con las imágenes ya cargadas. */
export function carouselOpenUrl(ws: string, post: Post, request: Request) {
  return `${studioConfig.carruselUrl}/?importar=${encodeURIComponent(handoffFeedUrl(ws, post, request))}`;
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = [studioConfig.carruselUrl, ...(process.env.STUDIO_CORS_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  };
}
