import { studioConfig } from "../config";
import type { StudioStorage } from "./types";

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: studioConfig.supabaseServiceKey,
    Authorization: `Bearer ${studioConfig.supabaseServiceKey}`,
    ...extra,
  };
}

/**
 * Supabase: imágenes en Storage (bucket público) y documentos en la tabla
 * `studio_kv` (ver supabase/studio.sql). Funciona en Vercel/serverless.
 */
export const supabaseStorage: StudioStorage = {
  async putMedia(key, data, contentType) {
    const { supabaseUrl, supabaseBucket } = studioConfig;
    const res = await fetch(`${supabaseUrl}/storage/v1/object/${supabaseBucket}/${key}`, {
      method: "POST",
      headers: headers({ "Content-Type": contentType, "x-upsert": "true" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`supabase_upload_${res.status}: ${await res.text()}`);
    return { key, url: `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${key}` };
  },
  async getJSON<T>(key: string) {
    const res = await fetch(
      `${studioConfig.supabaseUrl}/rest/v1/studio_kv?key=eq.${encodeURIComponent(key)}&select=value`,
      { headers: headers(), cache: "no-store" },
    );
    if (!res.ok) throw new Error(`supabase_read_${res.status}: ${await res.text()}`);
    const rows = (await res.json()) as Array<{ value: T }>;
    return rows[0]?.value ?? null;
  },
  async setJSON(key, value) {
    const res = await fetch(`${studioConfig.supabaseUrl}/rest/v1/studio_kv`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`supabase_write_${res.status}: ${await res.text()}`);
  },
};
