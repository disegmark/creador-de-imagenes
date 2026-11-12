import { hasSession, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";
import { getSettings, saveSettings } from "@/lib/studio/repo";
import { NETWORKS, type Route, type StudioSettings } from "@/lib/studio/types";

export const runtime = "nodejs";

export async function GET() {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await hasSession())) return unauthorized();
  return Response.json({ settings: await getSettings() });
}

export async function PUT(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await hasSession())) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Partial<StudioSettings>;
  const current = await getSettings();
  const routes = { ...current.routes };
  for (const n of NETWORKS) {
    const value = body.routes?.[n.key] as Route | undefined;
    if (value === "n8n" || (value === "direct" && n.direct)) routes[n.key] = value;
  }
  const next: StudioSettings = {
    routes,
    defaultMode: body.defaultMode === "direct" || body.defaultMode === "approval" ? body.defaultMode : current.defaultMode,
  };
  await saveSettings(next);
  return Response.json({ settings: next });
}
