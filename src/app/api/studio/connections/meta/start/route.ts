import { cookies } from "next/headers";
import { hasSession } from "@/lib/studio/auth";
import { isStudioEnabled, publicBase, studioConfig } from "@/lib/studio/config";
import { newId } from "@/lib/studio/crypto";
import { metaAuthUrl } from "@/lib/studio/publishers/meta";

export const runtime = "nodejs";

/** Inicia la conexión con Facebook/Instagram desde el Dashboard (OAuth de Meta). */
export async function GET(request: Request) {
  const base = publicBase(request);
  if (!isStudioEnabled() || !(await hasSession())) return Response.redirect(`${base}/studio`, 302);
  if (!studioConfig.metaAppId || !studioConfig.metaAppSecret) {
    return Response.redirect(`${base}/studio?tab=conexiones&error=meta_not_configured`, 302);
  }
  const state = newId();
  const store = await cookies();
  store.set("studio_meta_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(metaAuthUrl(`${base}/api/studio/connections/meta/callback`, state), 302);
}
