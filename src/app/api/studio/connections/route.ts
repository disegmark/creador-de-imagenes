import { hasSession, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled, studioConfig } from "@/lib/studio/config";
import { resolveMetaCredentials } from "@/lib/studio/publishers/meta";
import { clearMetaConnection, getMetaConnection, getSettings } from "@/lib/studio/repo";

export const runtime = "nodejs";

/** Estado de todas las conexiones (sin exponer tokens). */
export async function GET() {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await hasSession())) return unauthorized();
  const [conn, creds, settings] = await Promise.all([getMetaConnection(), resolveMetaCredentials(), getSettings()]);
  return Response.json({
    settings,
    openai: { configured: Boolean(studioConfig.openaiKey), model: studioConfig.openaiImageModel },
    planner: { configured: Boolean(studioConfig.anthropicKey) },
    storage: { kind: studioConfig.storage, publicUrl: studioConfig.publicUrl || null },
    meta: {
      oauthAvailable: Boolean(studioConfig.metaAppId && studioConfig.metaAppSecret),
      source: creds?.source ?? null,
      pageName: conn?.pageName ?? null,
      pageId: creds?.pageId || null,
      igUserId: creds?.igUserId ?? null,
      igUsername: conn?.igUsername ?? null,
      userName: conn?.userName ?? null,
      connectedAt: conn?.connectedAt ?? null,
    },
    n8n: {
      publish: Boolean(studioConfig.n8nPublishUrl),
      approval: Boolean(studioConfig.n8nApprovalUrl),
      signed: Boolean(studioConfig.n8nSecret),
    },
    api: { apiKey: Boolean(studioConfig.apiKey), cron: Boolean(studioConfig.cronSecret) },
    carousel: { url: studioConfig.carruselUrl },
  });
}

export async function DELETE(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await hasSession())) return unauthorized();
  if (new URL(request.url).searchParams.get("provider") !== "meta") return Response.json({ error: "unknown_provider" }, { status: 422 });
  await clearMetaConnection();
  return Response.json({ ok: true });
}
