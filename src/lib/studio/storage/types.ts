export type StoredMedia = { key: string; url: string };
export type Versioned<T> = { value: T | null; version: number };

/** Almacenamiento intercambiable: archivos (imágenes) + documentos JSON con versión. */
export interface StudioStorage {
  putMedia(key: string, data: Buffer, contentType: string, base: string): Promise<StoredMedia>;
  getMedia?(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  getJSON<T>(key: string): Promise<Versioned<T>>;
  /**
   * Escribe solo si nadie cambió el documento desde que se leyó (`version`).
   * Devuelve false si hubo un cambio concurrente: quien llama vuelve a leer y reintenta.
   */
  setJSONIfVersion<T>(key: string, value: T, version: number): Promise<boolean>;
}
