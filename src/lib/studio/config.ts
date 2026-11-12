
/** Lectura centralizada de variables de entorno del Studio (solo servidor). */
export const studioConfig = {
  password: process.env.STUDIO_PASSWORD ?? "",
  secret: process.env.STUDIO_SECRET ?? "",
  apiKey: process.env.STUDIO_API_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  publicUrl: (process.env.STUDIO_PUBLIC_URL ?? "").replace(/\/$/, ""),

  openaiKey: process.env.OPENAI_API_KEY ?? "",
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5",
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),

  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",

  storage: (process.env.STUDIO_STORAGE ?? "fs") as "fs" | "supabase",
  dataDir: process.env.STUDIO_DATA_DIR || ".data/studio",
  supabaseUrl: (process.env.SUPABASE_URL ?? "").replace(/\/$/, ""),
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseBucket: process.env.STUDIO_SUPABASE_BUCKET || "studio-media",

  n8nPublishUrl: process.env.N8N_PUBLISH_WEBHOOK_URL ?? "",
  n8nApprovalUrl: process.env.N8N_APPROVAL_WEBHOOK_URL ?? "",
  n8nSecret: process.env.N8N_WEBHOOK_SECRET ?? "",

  metaAppId: process.env.META_APP_ID ?? "",
  metaAppSecret: process.env.META_APP_SECRET ?? "",
  metaGraphVersion: process.env.META_GRAPH_VERSION || "v24.0",
  // Alternativa sin OAuth: token de página de larga duración puesto a mano.
  metaPageId: process.env.META_PAGE_ID ?? "",
  metaPageToken: process.env.META_PAGE_ACCESS_TOKEN ?? "",
  metaIgUserId: process.env.META_IG_USER_ID ?? "",

  carruselUrl: (process.env.NEXT_PUBLIC_CARRUSEL_URL || "https://carruseles.ia.nom.pe").replace(/\/$/, ""),
};

export function isStudioEnabled() {
  return studioConfig.password.length > 0 && studioConfig.secret.length >= 32;
}

/** Base pública absoluta: env STUDIO_PUBLIC_URL o el origen de la petición. */
export function publicBase(request?: Request) {
  if (studioConfig.publicUrl) return studioConfig.publicUrl;
  if (request) return new URL(request.url).origin;
  return "";
}
