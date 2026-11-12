import { cookies } from "next/headers";
import { sessionWorkspace } from "@/lib/studio/auth";
import { publicBase } from "@/lib/studio/config";
import { encrypt, safeEqual } from "@/lib/studio/crypto";
import { exchangeMetaCode } from "@/lib/studio/publishers/meta";
import { saveMetaConnection, setMetaPending } from "@/lib/studio/repo";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const base = publicBase(request);
  const back = (q: string) => Response.redirect(`${base}/studio?tab=conexiones&${q}`, 302);
  const ws = isStudioEnabled() ? await sessionWorkspace() : null;
  if (!ws) return Response.redirect(`${base}/studio`, 302);

  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get("studio_meta_state")?.value ?? "";
  store.delete("studio_meta_state");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("error=meta_denied");
  if (!code || !expected || !safeEqual(state, expected) || !state.startsWith(`${ws.id}.`)) return back("error=meta_state");

  try {
    const { userName, pages } = await exchangeMetaCode(code, `${base}/api/studio/connections/meta/callback`);
    if (pages.length === 0) return back("error=meta_no_pages");
    if (pages.length === 1) {
      const p = pages[0];
      await saveMetaConnection(ws.id, { userName, pageId: p.id, pageName: p.name, pageToken: p.access_token, igUserId: p.instagram_business_account?.id, igUsername: p.instagram_business_account?.username });
      return back("connected=meta");
    }
    // Varias páginas: guardamos la lista cifrada y el usuario elige en el panel.
    await setMetaPending(ws.id, { userName, pagesEnc: encrypt(JSON.stringify(pages)), at: Date.now() });
    return back("select=meta");
  } catch (error) {
    console.error("[studio/meta]", error);
    return back("error=meta_exchange");
  }
}
