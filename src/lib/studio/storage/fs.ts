import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { studioConfig } from "../config";
import type { StudioStorage, Versioned } from "./types";

const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

function root() {
  // turbopackIgnore: la carpeta de datos se decide en tiempo de ejecución; no incluir el proyecto en el bundle.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), studioConfig.dataDir);
}

function safeKey(key: string) {
  if (!/^[A-Za-z0-9_-]+(\.[a-z0-9]+)?$/.test(key)) throw new Error("invalid_key");
  return key;
}

type Envelope<T> = { version: number; value: T | null };

// Un solo proceso (VPS/Docker): la comprobación de versión + escritura es atómica
// dentro de esta cola por clave.
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>) {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.catch(() => undefined));
  return next;
}

async function readEnvelope<T>(key: string): Promise<Envelope<T>> {
  try {
    const parsed = JSON.parse(await readFile(path.join(root(), `${safeKey(key)}.json`), "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && "version" in parsed && "value" in parsed) return parsed as Envelope<T>;
    return { version: 1, value: parsed as T }; // formato anterior sin versión
  } catch {
    return { version: 0, value: null };
  }
}

/**
 * Almacenamiento en disco — para un servidor propio (VPS, Docker, `next start`).
 * Las imágenes se sirven desde /api/studio/media/<archivo>. En Vercel el disco es
 * efímero: usa STUDIO_STORAGE=supabase.
 */
export const fsStorage: StudioStorage = {
  async putMedia(key, data, _contentType, base) {
    const dir = path.join(root(), "media");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, safeKey(key)), data);
    return { key, url: `${base}/api/studio/media/${key}` };
  },
  async getMedia(key) {
    try {
      const data = await readFile(path.join(root(), "media", safeKey(key)));
      const ext = key.split(".").pop() ?? "png";
      return { data, contentType: MIME_BY_EXT[ext] ?? "application/octet-stream" };
    } catch {
      return null;
    }
  },
  async getJSON<T>(key: string): Promise<Versioned<T>> {
    const env = await readEnvelope<T>(key);
    return { value: env.value, version: env.version };
  },
  setJSONIfVersion(key, value, version) {
    return withLock(key, async () => {
      const current = await readEnvelope(key);
      if (current.version !== version) return false;
      await mkdir(root(), { recursive: true });
      const file = path.join(root(), `${safeKey(key)}.json`);
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, JSON.stringify({ version: version + 1, value }, null, 2));
      await rename(tmp, file);
      return true;
    });
  },
};
