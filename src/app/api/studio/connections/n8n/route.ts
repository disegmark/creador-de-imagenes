import { hasSession, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled, studioConfig } from "@/lib/studio/config";
import { postToN8n } from "@/lib/studio/publishers/n8n";

export const runtime = "nodejs";

/** Envía un ping de prueba al webhook de n8n (event: "ping"). */
export async function POST() {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await hasSession())) return unauthorized();
  if (!studioConfig.n8nPublishUrl) return Response.json({ ok: false, error: "N8N_PUBLISH_WEBHOOK_URL no configurada" }, { status: 422 });
  try {
    const { ok, status } = await postToN8n(studioConfig.n8nPublishUrl, { event: "ping", at: new Date().toISOString() });
    return Response.json({ ok, status });
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
