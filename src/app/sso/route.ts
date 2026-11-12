import { setSession } from "@/lib/studio/auth";
import { publicBase } from "@/lib/studio/config";
import { redeemPass } from "@/lib/studio/sso";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

/**
 * Entrada automática desde el Dashboard: /sso?t=<pase firmado de 30 s>.
 * El pase se canjea por una sesión propia de esta app, fijada al espacio del panel.
 */
export async function GET(request: Request) {
  const base = publicBase(request);
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (!isStudioEnabled()) return new Response(null, { status: 303, headers: { ...headers, Location: `${base}/studio` } });
  const ws = redeemPass(new URL(request.url).searchParams.get("t"));
  if (!ws) return new Response(null, { status: 303, headers: { ...headers, Location: `${base}/studio?sso=invalido` } });
  await setSession(ws.id);
  return new Response(null, { status: 303, headers: { ...headers, Location: `${base}/studio` } });
}
