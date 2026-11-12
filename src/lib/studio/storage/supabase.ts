import { studioConfig } from "../config";
import type { StudioStorage, Versioned } from "./types";

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: studioConfig.supabaseServiceKey,
    Authorization: `Bearer ${studioConfig.supabaseServiceKey}`,
    ...extra,
  };
}

const rest = (query: string) => `${studioConfig.supabaseUrl}/rest/v1/studio_kv${query}`;

/**
 * Supabase: imágenes en Storage (bucket público) y documentos en la tabla
 * `studio_kv` (ver supabase/studio.sql). La columna `version` hace que dos
 * instancias serverless no se pisen: cada escritura exige la versión leída.
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
  async getJSON<T>(key: string): Promise<Versioned<T>> {
    const res = await fetch(rest(`?key=eq.${encodeURIComponent(key)}&select=value,version`), { headers: headers(), cache: "no-store" });
    if (!res.ok) throw new Error(`supabase_read_${res.status}: ${await res.text()}`);
    const rows = (await res.json()) as Array<{ value: T; version: number }>;
    return rows[0] ? { value: rows[0].value, version: Number(rows[0].version) } : { value: null, version: 0 };
  },
  async setJSONIfVersion(key, value, version) {
    const updated_at = new Date().toISOString();
    if (version === 0) {
      // Primera escritura: insertar; si otro ya insertó, no hace nada (devuelve 0 filas).
      const res = await fetch(rest(""), {
        method: "POST",
        headers: headers({ "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" }),
        body: JSON.stringify({ key, value, version: 1, updated_at }),
      });
      if (!res.ok) throw new Error(`supabase_write_${res.status}: ${await res.text()}`);
      return ((await res.json()) as unknown[]).length === 1;
    }
    const res = await fetch(rest(`?key=eq.${encodeURIComponent(key)}&version=eq.${version}`), {
      method: "PATCH",
      headers: headers({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify({ value, version: version + 1, updated_at }),
    });
    if (!res.ok) throw new Error(`supabase_write_${res.status}: ${await res.text()}`);
    return ((await res.json()) as unknown[]).length === 1;
  },
};
