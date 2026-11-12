import { notConfigured, sessionWorkspace, unauthorized } from "@/lib/studio/auth";
import { postToN8n } from "@/lib/studio/publishers/n8n";
import { isStudioEnabled, n8nFor } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

/** Envía un ping de prueba al webhook de n8n del espacio (event: "ping"). */
export async function POST() {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await sessionWorkspace();
  if (!ws) return unauthorized();
  const { publishUrl, secret } = n8nFor(ws);
  if (!publishUrl) return Response.json({ ok: false, error: "Webhook de n8n no configurado" }, { status: 422 });
  try {
    const { ok, status } = await postToN8n(publishUrl, secret, { event: "ping", workspace: ws.id, at: new Date().toISOString() });
    return Response.json({ ok, status });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
