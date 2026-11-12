import { cookies } from "next/headers";
import { isStudioEnabled, studioConfig } from "./config";
import { safeEqual, sign } from "./crypto";

export const SESSION_COOKIE = "studio_session";
const SESSION_TTL_S = 60 * 60 * 24 * 7;

export function createSessionValue() {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `v1.${exp}`;
  return { value: `${payload}.${sign(payload)}`, maxAge: SESSION_TTL_S };
}

function verifySessionValue(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(sign(payload), parts[2])) return false;
  return Number(parts[1]) > Date.now() / 1000;
}

export function checkPassword(candidate: string) {
  return isStudioEnabled() && safeEqual(candidate, studioConfig.password);
}

/** Sesión del panel (cookie firmada). */
export async function hasSession() {
  if (!isStudioEnabled()) return false;
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value);
}

/** Llamada máquina-a-máquina (n8n, Carrusel Studio, Dashboard 360): Authorization: Bearer STUDIO_API_KEY. */
export function hasApiKey(request: Request) {
  if (!studioConfig.apiKey) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : request.headers.get("x-studio-key") ?? "";
  return token.length > 0 && safeEqual(token, studioConfig.apiKey);
}

export async function isAuthorized(request: Request) {
  return hasApiKey(request) || (await hasSession());
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function notConfigured() {
  return Response.json({ error: "studio_not_configured" }, { status: 503 });
}
