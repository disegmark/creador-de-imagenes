import { cookies } from "next/headers";
import { hasSession } from "@/lib/studio/auth";
import { isStudioEnabled, publicBase } from "@/lib/studio/config";
import { encrypt, safeEqual } from "@/lib/studio/crypto";
import { exchangeMetaCode } from "@/lib/studio/publishers/meta";
import { saveMetaConnection } from "@/lib/studio/repo";
import { getStorage } from "@/lib/studio/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const base = publicBase(request);
  const back = (q: string) => Response.redirect(`${base}/studio?tab=conexiones&${q}`, 302);
  if (!isStudioEnabled() || !(await hasSession())) return Response.redirect(`${base}/studio`, 302);

  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get("studio_meta_state")?.value ?? "";
  store.delete("studio_meta_state");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back("error=meta_denied");
  if (!code || !expected || !safeEqual(state, expected)) return back("error=meta_state");

  try {
    const { userName, pages } = await exchangeMetaCode(code, `${base}/api/studio/connections/meta/callback`);
    if (pages.length === 0) return back("error=meta_no_pages");
    if (pages.length === 1) {
      const p = pages[0];
      await saveMetaConnection({ userName, pageId: p.id, pageName: p.name, pageToken: p.access_token, igUserId: p.instagram_business_account?.id, igUsername: p.instagram_business_account?.username });
      return back("connected=meta");
    }
    // Varias páginas: guardamos la lista cifrada y el usuario elige en el panel.
    await getStorage().setJSON("meta-pending", { userName, pagesEnc: encrypt(JSON.stringify(pages)), at: Date.now() });
    return back("select=meta");
  } catch (error) {
    console.error("[studio/meta]", error);
    return back("error=meta_exchange");
  }
}
