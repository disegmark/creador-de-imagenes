import { studioConfig } from "./config";

/**
 * Espacio de trabajo = un sistema/dashboard que usa la app (ej. "ia360", "cg360").
 * Cada uno tiene sus propias publicaciones, conexiones, ajustes, clave de API y
 * secreto de entrada automática. Nada se comparte entre espacios.
 */
export type Workspace = {
  id: string;
  name: string;
  /** Contraseña para entrar a mano (opcional si solo se entra desde el Dashboard). */
  password?: string;
  /** Secreto propio para verificar el pase del Dashboard (>= 32 caracteres). */
  ssoSecret?: string;
  /** Usuario que viene dentro del pase (`u`). Por defecto, el id del espacio. */
  ssoUser: string;
  /** Clave para llamadas máquina-a-máquina (n8n, Carrusel Studio, Dashboard). */
  apiKey?: string;
  n8nPublishUrl?: string;
  n8nApprovalUrl?: string;
  n8nSecret?: string;
};

type RawWorkspace = Partial<Record<
  "id" | "nombre" | "name" | "password" | "sso_secret" | "sso_usuario" | "api_key" | "n8n_publish_url" | "n8n_approval_url" | "n8n_secret",
  string
>>;

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

let cache: { raw: string; list: Workspace[] } | null = null;

function str(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function parse(): Workspace[] {
  const raw = process.env.STUDIO_WORKSPACES ?? "";
  if (cache && cache.raw === raw) return cache.list;

  let list: Workspace[] = [];
  if (raw.trim()) {
    try {
      const data = JSON.parse(raw) as RawWorkspace[];
      if (!Array.isArray(data)) throw new Error("STUDIO_WORKSPACES debe ser una lista JSON");
      for (const item of data) {
        const id = str(item.id)?.toLowerCase();
        if (!id || !ID_RE.test(id)) {
          console.error(`[studio] espacio ignorado: id inválido (${item.id})`);
          continue;
        }
        if (list.some((w) => w.id === id)) {
          console.error(`[studio] espacio duplicado ignorado: ${id}`);
          continue;
        }
        const ssoSecret = str(item.sso_secret);
        if (ssoSecret && ssoSecret.length < 32) console.error(`[studio] ${id}: sso_secret con menos de 32 caracteres, entrada automática desactivada`);
        list.push({
          id,
          name: str(item.nombre) ?? str(item.name) ?? id,
          password: str(item.password),
          ssoSecret: ssoSecret && ssoSecret.length >= 32 ? ssoSecret : undefined,
          ssoUser: str(item.sso_usuario) ?? id,
          apiKey: str(item.api_key),
          n8nPublishUrl: str(item.n8n_publish_url),
          n8nApprovalUrl: str(item.n8n_approval_url),
          n8nSecret: str(item.n8n_secret),
        });
      }
    } catch (error) {
      console.error("[studio] STUDIO_WORKSPACES no es JSON válido", error);
      list = [];
    }
  } else if (process.env.STUDIO_PASSWORD || process.env.STUDIO_SSO_SECRET) {
    // Compatibilidad: un solo espacio configurado con variables sueltas.
    const ssoSecret = str(process.env.STUDIO_SSO_SECRET);
    list = [
      {
        id: "principal",
        name: "Principal",
        password: str(process.env.STUDIO_PASSWORD),
        ssoSecret: ssoSecret && ssoSecret.length >= 32 ? ssoSecret : undefined,
        ssoUser: str(process.env.STUDIO_SSO_USUARIO) ?? "ia360",
        apiKey: str(process.env.STUDIO_API_KEY),
        n8nPublishUrl: str(process.env.N8N_PUBLISH_WEBHOOK_URL),
        n8nApprovalUrl: str(process.env.N8N_APPROVAL_WEBHOOK_URL),
        n8nSecret: str(process.env.N8N_WEBHOOK_SECRET),
      },
    ];
  }

  // Las contraseñas y claves deben ser únicas: identifican al espacio.
  for (const field of ["password", "apiKey", "ssoSecret"] as const) {
    const seen = new Set<string>();
    for (const w of list) {
      const v = w[field];
      if (!v) continue;
      if (seen.has(v)) console.error(`[studio] ${field} repetido entre espacios: cada espacio debe tener el suyo`);
      seen.add(v);
    }
  }

  cache = { raw, list };
  return list;
}

export function getWorkspaces() {
  return parse();
}

export function getWorkspace(id: string | null | undefined) {
  return id ? (parse().find((w) => w.id === id) ?? null) : null;
}

export function isStudioEnabled() {
  return studioConfig.secret.length >= 32 && parse().length > 0;
}

/** URLs de n8n del espacio, con las globales como respaldo. */
export function n8nFor(ws: Workspace) {
  return {
    publishUrl: ws.n8nPublishUrl ?? studioConfig.n8nPublishUrl,
    approvalUrl: ws.n8nApprovalUrl ?? studioConfig.n8nApprovalUrl,
    secret: ws.n8nSecret ?? studioConfig.n8nSecret,
  };
}
