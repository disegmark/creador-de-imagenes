import { notConfigured, sessionWorkspace, unauthorized } from "@/lib/studio/auth";
import { decrypt } from "@/lib/studio/crypto";
import { getMetaPending, saveMetaConnection, setMetaPending } from "@/lib/studio/repo";
import { inputErrorResponse } from "@/lib/studio/service";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

type Pending = { userName?: string; pagesEnc: string; at: number } | null;
type Page = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };

async function pendingPages(ws: string) {
  const pending = await getMetaPending<Pending>(ws);
  if (!pending || Date.now() - pending.at > 15 * 60 * 1000) return null;
  return { userName: pending.userName, pages: JSON.parse(decrypt(pending.pagesEnc)) as Page[] };
}

/** Lista las páginas pendientes de elegir (sin tokens). */
export async function GET() {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await sessionWorkspace();
  if (!ws) return unauthorized();
  const pending = await pendingPages(ws.id);
  return Response.json({
    pages: (pending?.pages ?? []).map((p) => ({ id: p.id, name: p.name, instagram: p.instagram_business_account?.username ?? (p.instagram_business_account ? "vinculado" : null) })),
  });
}

export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  const ws = await sessionWorkspace();
  if (!ws) return unauthorized();
  try {
    const { pageId } = (await request.json().catch(() => ({}))) as { pageId?: string };
    const pending = await pendingPages(ws.id);
    const page = pending?.pages.find((p) => p.id === pageId);
    if (!page) return Response.json({ error: "page_not_found" }, { status: 404 });
    await saveMetaConnection(ws.id, {
      userName: pending!.userName,
      pageId: page.id,
      pageName: page.name,
      pageToken: page.access_token,
      igUserId: page.instagram_business_account?.id,
      igUsername: page.instagram_business_account?.username,
    });
    await setMetaPending(ws.id, null);
    return Response.json({ ok: true });
  } catch (error) {
    return inputErrorResponse(error);
  }
}
