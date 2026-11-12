import { cookies } from "next/headers";
import { studioConfig } from "./config";
import { safeEqual, sign } from "./crypto";
import { getWorkspace, getWorkspaces, isStudioEnabled, type Workspace } from "./workspaces";

export const SESSION_COOKIE = "studio_session";
const SESSION_TTL_S = 60 * 60 * 24 * 7;

/** Sesión firmada que fija el espacio de trabajo: v2.<espacio>.<expira>.<firma> */
export function createSessionValue(wsId: string) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `v2.${wsId}.${exp}`;
  return { value: `${payload}.${sign(`session:${payload}`)}`, maxAge: SESSION_TTL_S };
}

function workspaceFromSession(value: string | undefined): Workspace | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v2") return null;
  const payload = parts.slice(0, 3).join(".");
  if (!safeEqual(sign(`session:${payload}`), parts[3])) return null;
  if (Number(parts[2]) <= Date.now() / 1000) return null;
  return getWorkspace(parts[1]);
}

export function sessionCookieOptions(maxAge: number) {
  const none = studioConfig.cookieSameSite === "none";
  return {
    httpOnly: true,
    secure: none || process.env.NODE_ENV === "production",
    sameSite: studioConfig.cookieSameSite,
    path: "/",
    maxAge,
    ...(none ? { partitioned: true } : {}),
  };
}

export async function setSession(wsId: string) {
  const session = createSessionValue(wsId);
  const store = await cookies();
  store.set(SESSION_COOKIE, session.value, sessionCookieOptions(session.maxAge));
}

/** Espacio por contraseña (entrada manual). Compara con todos para no filtrar cuál existe. */
export function workspaceByPassword(candidate: string): Workspace | null {
  if (!isStudioEnabled() || !candidate) return null;
  let found: Workspace | null = null;
  for (const ws of getWorkspaces()) {
    if (ws.password && safeEqual(candidate, ws.password) && !found) found = ws;
  }
  return found;
}

/** Espacio de la sesión del panel (cookie firmada). */
export async function sessionWorkspace(): Promise<Workspace | null> {
  if (!isStudioEnabled()) return null;
  const store = await cookies();
  return workspaceFromSession(store.get(SESSION_COOKIE)?.value);
}

/** ¿Hay una persona con sesión del panel en este espacio? (no una clave de API ni un enlace) */
export async function hasPanelSession(wsId: string) {
  return (await sessionWorkspace())?.id === wsId;
}

/** Espacio por clave de API: Authorization: Bearer <api_key del espacio>. */
export function apiKeyWorkspace(request: Request): Workspace | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : (request.headers.get("x-studio-key") ?? "");
  if (!token) return null;
  let found: Workspace | null = null;
  for (const ws of getWorkspaces()) {
    if (ws.apiKey && safeEqual(token, ws.apiKey) && !found) found = ws;
  }
  return found;
}

/** Sesión del panel o clave de API → espacio de trabajo; null = no autorizado. */
export async function authorize(request: Request): Promise<Workspace | null> {
  if (!isStudioEnabled()) return null;
  return apiKeyWorkspace(request) ?? (await sessionWorkspace());
}

export function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function notConfigured() {
  return Response.json({ error: "studio_not_configured" }, { status: 503 });
}
