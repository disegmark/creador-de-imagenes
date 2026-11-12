export type StoredMedia = { key: string; url: string };

/** Almacenamiento intercambiable: archivos (imágenes) + documentos JSON clave/valor. */
export interface StudioStorage {
  putMedia(key: string, data: Buffer, contentType: string, base: string): Promise<StoredMedia>;
  getMedia?(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T): Promise<void>;
}
