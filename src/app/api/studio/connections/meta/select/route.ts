import { hasSession, notConfigured, unauthorized } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";
import { decrypt } from "@/lib/studio/crypto";
import { saveMetaConnection } from "@/lib/studio/repo";
import { getStorage } from "@/lib/studio/storage";

export const runtime = "nodejs";

type Pending = { userName?: string; pagesEnc: string; at: number } | null;
type Page = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };

async function pendingPages() {
  const pending = await getStorage().getJSON<Pending>("meta-pending");
  if (!pending || Date.now() - pending.at > 15 * 60 * 1000) return null;
  return { userName: pending.userName, pages: JSON.parse(decrypt(pending.pagesEnc)) as Page[] };
}

/** Lista las páginas pendientes de elegir (sin tokens). */
export async function GET() {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await hasSession())) return unauthorized();
  const pending = await pendingPages();
  return Response.json({
    pages: (pending?.pages ?? []).map((p) => ({ id: p.id, name: p.name, instagram: p.instagram_business_account?.username ?? (p.instagram_business_account ? "vinculado" : null) })),
  });
}

export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await hasSession())) return unauthorized();
  const { pageId } = (await request.json().catch(() => ({}))) as { pageId?: string };
  const pending = await pendingPages();
  const page = pending?.pages.find((p) => p.id === pageId);
  if (!page) return Response.json({ error: "page_not_found" }, { status: 404 });
  await saveMetaConnection({
    userName: pending!.userName,
    pageId: page.id,
    pageName: page.name,
    pageToken: page.access_token,
    igUserId: page.instagram_business_account?.id,
    igUsername: page.instagram_business_account?.username,
  });
  await getStorage().setJSON("meta-pending", null);
  return Response.json({ ok: true });
}
