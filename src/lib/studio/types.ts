/** Redes sociales que el Studio sabe publicar (directo o vía n8n). */
export type Network = "instagram" | "facebook" | "linkedin" | "tiktok" | "x";

export const NETWORKS: Array<{ key: Network; label: string; direct: boolean }> = [
  { key: "instagram", label: "Instagram", direct: true },
  { key: "facebook", label: "Facebook", direct: true },
  { key: "linkedin", label: "LinkedIn", direct: false },
  { key: "tiktok", label: "TikTok", direct: false },
  { key: "x", label: "X (Twitter)", direct: false },
];

export function isNetwork(value: unknown): value is Network {
  return typeof value === "string" && NETWORKS.some((n) => n.key === value);
}

/** Cómo se enruta la publicación de una red: directo (API oficial) o vía n8n. */
export type Route = "direct" | "n8n";

/** Formatos de Carrusel Studio. */
export type AspectFormat = "4:5" | "1:1" | "9:16" | "16:9";

export type MediaItem = {
  id: string;
  url: string; // URL pública (la necesitan Instagram/Facebook/n8n para descargarla)
  contentType: string;
  prompt?: string;
  title?: string; // texto sugerido para la lámina en Carrusel Studio
  text?: string;
  createdAt: string;
};

/**
 * draft            → creado, todavía en edición (o enviado a Carrusel Studio)
 * pending_approval → espera aprobación humana
 * approved         → aprobado; se publica ahora o a la hora programada
 * publishing       → en curso
 * published        → publicado en todas las redes elegidas
 * partial          → publicado en algunas redes, falló en otras
 * failed           → falló en todas
 * rejected         → rechazado en la aprobación
 */
export type PostStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "rejected";

export type PublishMode = "approval" | "direct";

export type PublishResult = {
  network: Network;
  route: Route;
  ok: boolean;
  externalId?: string;
  permalink?: string;
  error?: string;
  at: string;
};

export type Post = {
  id: string;
  caption: string;
  media: MediaItem[];
  networks: Network[];
  mode: PublishMode;
  status: PostStatus;
  format: AspectFormat;
  scheduledAt?: string | null;
  source: "studio" | "carrusel" | "api";
  results: PublishResult[];
  note?: string; // motivo de rechazo / comentario de aprobación
  createdAt: string;
  updatedAt: string;
};

/** Cuenta de Meta conectada desde el Dashboard (OAuth). Los tokens se guardan cifrados. */
export type MetaConnection = {
  connectedAt: string;
  userName?: string;
  pageId: string;
  pageName: string;
  pageTokenEnc: string;
  igUserId?: string;
  igUsername?: string;
};

export type StudioSettings = {
  /** Ruta preferida por red. Las redes sin API directa siempre van por n8n. */
  routes: Partial<Record<Network, Route>>;
  defaultMode: PublishMode;
};
