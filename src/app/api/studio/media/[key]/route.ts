import { getStorage } from "@/lib/studio/storage";

export const runtime = "nodejs";

/**
 * Sirve imágenes del almacenamiento en disco. Es público a propósito: Instagram,
 * Facebook y n8n necesitan descargar la imagen por URL. Los nombres son aleatorios.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const storage = getStorage();
  if (!storage.getMedia || !/^[A-Za-z0-9_-]+\.(png|jpg|webp)$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  const file = await storage.getMedia(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
