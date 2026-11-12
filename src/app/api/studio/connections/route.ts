import { notConfigured, sessionWorkspace, unauthorized } from "@/lib/studio/auth";
import { studioConfig } from "@/lib/studio/config";
import { resolveMetaCredentials } from "@/lib/studio/publishers/meta";
import { clearMetaConnection, getMetaConnection, getSettings } from "@/lib/studio/repo";
import { inputErrorResponse } from "@/lib/studio/service";
import { isStudioEnabled, n8nFor } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

/** Estado de las conexiones del espacio (sin exponer tokens). */
export async function GET() {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await sessionWorkspace();
  if (!ws) return unauthorized();
  let metaError: string | null = null;
  const creds = await resolveMetaCredentials(ws.id).catch((e: Error) => {
    metaError = e.message;
    return null;
  });
  const [conn, settings] = await Promise.all([getMetaConnection(ws.id), getSettings(ws.id)]);
  const n8n = n8nFor(ws);
  return Response.json({
    workspace: { id: ws.id, name: ws.name, sso: Boolean(ws.ssoSecret) },
    settings,
    openai: { configured: Boolean(studioConfig.openaiKey), model: studioConfig.openaiImageModel },
    planner: { configured: Boolean(studioConfig.anthropicKey) },
    storage: { kind: studioConfig.storage, publicUrl: studioConfig.publicUrl || null },
    meta: {
      oauthAvailable: Boolean(studioConfig.metaAppId && studioConfig.metaAppSecret),
      source: creds?.source ?? null,
      error: metaError,
      pageName: conn?.pageName ?? null,
      pageId: creds?.pageId || conn?.pageId || null,
      igUserId: creds?.igUserId ?? null,
      igUsername: conn?.igUsername ?? null,
      userName: conn?.userName ?? null,
      connectedAt: conn?.connectedAt ?? null,
    },
    n8n: { publish: Boolean(n8n.publishUrl), approval: Boolean(n8n.approvalUrl), signed: Boolean(n8n.secret) },
    api: { apiKey: Boolean(ws.apiKey), cron: Boolean(studioConfig.cronSecret) },
    carousel: { url: studioConfig.carruselUrl },
  });
}

export async function DELETE(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await sessionWorkspace();
  if (!ws) return unauthorized();
  if (new URL(request.url).searchParams.get("provider") !== "meta") return Response.json({ error: "unknown_provider" }, { status: 422 });
  try {
    await clearMetaConnection(ws.id);
    return Response.json({ ok: true });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
