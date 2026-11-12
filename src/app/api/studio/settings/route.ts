import { notConfigured, sessionWorkspace, unauthorized } from "@/lib/studio/auth";
import { getSettings, saveSettings } from "@/lib/studio/repo";
import { inputErrorResponse } from "@/lib/studio/service";
import { NETWORKS, type Route, type StudioSettings } from "@/lib/studio/types";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

export async function GET() {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await sessionWorkspace();
  if (!ws) return unauthorized();
  return Response.json({ settings: await getSettings(ws.id) });
}

export async function PUT(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await sessionWorkspace();
  if (!ws) return unauthorized();
  try {
    const body = (await request.json().catch(() => ({}))) as Partial<StudioSettings>;
    const current = await getSettings(ws.id);
    const routes = { ...current.routes };
    for (const n of NETWORKS) {
      const value = body.routes?.[n.key] as Route | undefined;
      if (value === "n8n" || (value === "direct" && n.direct)) routes[n.key] = value;
    }
    const next: StudioSettings = {
      routes,
      defaultMode: body.defaultMode === "direct" || body.defaultMode === "approval" ? body.defaultMode : current.defaultMode,
    };
    await saveSettings(ws.id, next);
    return Response.json({ settings: next });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
