import { cookies } from "next/headers";
import { sessionWorkspace } from "@/lib/studio/auth";
import { publicBase, studioConfig } from "@/lib/studio/config";
import { newId, sign } from "@/lib/studio/crypto";
import { metaAuthUrl } from "@/lib/studio/publishers/meta";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

/** Inicia la conexión con Facebook/Instagram (OAuth de Meta) para el espacio de la sesión. */
export async function GET(request: Request) {
  const base = publicBase(request);
  const ws = isStudioEnabled() ? await sessionWorkspace() : null;
  if (!ws) return Response.redirect(`${base}/studio`, 302);
  if (!studioConfig.metaAppId || !studioConfig.metaAppSecret) {
    return Response.redirect(`${base}/studio?tab=conexiones&error=meta_not_configured`, 302);
  }
  // El state queda atado al espacio: la conexión vuelve siempre al mismo espacio que la pidió.
  const nonce = newId();
  const state = `${ws.id}.${nonce}.${sign(`meta-state:${ws.id}:${nonce}`).slice(0, 22)}`;
  const store = await cookies();
  store.set("studio_meta_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(metaAuthUrl(`${base}/api/studio/connections/meta/callback`, state), 302);
}
