import { createHmac } from "node:crypto";
import { studioConfig } from "./config";
import { safeEqual } from "./crypto";
import { getWorkspaces, type Workspace } from "./workspaces";

// Pases ya canjeados (hasta que expiran): un pase no se puede usar dos veces.
const used = new Map<string, number>();
const MAX_PASS_LIFETIME_MS = 5 * 60 * 1000;

function prune(now: number) {
  for (const [k, exp] of used) if (exp < now) used.delete(k);
}

/**
 * Verifica el pase del Dashboard (mismo formato que server/routes/sso.js de agente-ia-360):
 *   base64url(JSON { app, u, exp }) + "." + base64url(HMAC-SHA256(secreto, cuerpo))
 * Solo vale para esta app (`app`), para el usuario registrado de un espacio (`u`)
 * y firmado con el secreto de ESE espacio: un panel no puede entrar en el espacio de otro.
 */
export function redeemPass(token: string | null): Workspace | null {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;

  let claims: { app?: unknown; u?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = Date.now();
  if (claims.app !== studioConfig.ssoApp || typeof claims.u !== "string" || typeof claims.exp !== "number") return null;
  if (claims.exp <= now || claims.exp > now + MAX_PASS_LIFETIME_MS) return null;

  const ws = getWorkspaces().find(
    (w) => w.ssoSecret && w.ssoUser === claims.u && safeEqual(createHmac("sha256", w.ssoSecret).update(body).digest("base64url"), signature),
  );
  if (!ws) return null;

  prune(now);
  if (used.has(signature)) return null;
  used.set(signature, claims.exp);
  return ws;
}
