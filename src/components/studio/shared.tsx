"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MediaItem, Network, PostStatus, Post } from "@/lib/studio/types";

export type ClientPost = Post & { carouselUrl?: string };
export type { MediaItem, Network, PostStatus };

export const NETWORK_OPTIONS: Array<{ key: Network; label: string }> = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "tiktok", label: "TikTok" },
  { key: "x", label: "X" },
];

export const STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Borrador",
  pending_approval: "Por aprobar",
  approved: "Aprobado",
  publishing: "Publicando…",
  published: "Publicado",
  partial: "Publicado parcial",
  failed: "Con error",
  rejected: "Rechazado",
};

export const STATUS_STYLE: Record<PostStatus, string> = {
  draft: "border-border text-muted",
  pending_approval: "border-sign-amber/50 text-sign-amber",
  approved: "border-cyan/50 text-cyan",
  publishing: "border-cyan/50 text-cyan",
  published: "border-success/50 text-success",
  partial: "border-sign-amber/50 text-sign-amber",
  failed: "border-sign-signal/50 text-sign-signal",
  rejected: "border-sign-signal/40 text-muted",
};

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "Tu sesión expiró. Vuelve a entrar.",
  not_configured: "Falta configurar OPENAI_API_KEY en el servidor.",
  planner_not_configured: "Falta configurar ANTHROPIC_API_KEY para planificar con iA.",
  networks_required: "Elige al menos una red social.",
  media_required: "Selecciona al menos una imagen.",
  too_many_media: "Máximo 10 imágenes por publicación.",
  prompt_required: "Escribe qué imagen quieres crear.",
  rate_limited: "Demasiadas solicitudes. Espera un momento.",
  moderation_blocked: "El generador rechazó el prompt por sus políticas de contenido. Reformúlalo.",
};

export class ApiError extends Error {}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    const code = data.error ?? `http_${res.status}`;
    throw new ApiError(ERROR_TEXT[code] ?? data.message ?? `Error: ${code}`);
  }
  return data as T;
}

export function Card({ title, hint, actions, children, className }: { title?: string; hint?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-background-elevated p-4 sm:p-5", className)}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
            {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: string; group?: boolean }) {
  if (group) {
    // Para grupos de botones: un <label> envolvente les daría a todos el mismo nombre accesible.
    return (
      <div role="group" aria-label={label} className="block text-xs text-muted">
        <span className="font-medium text-foreground/90">{label}</span>
        <div className="mt-1.5">{children}</div>
        {hint ? <span className="mt-1 block text-[11px]">{hint}</span> : null}
      </div>
    );
  }
  return (
    <label className="block text-xs text-muted">
      <span className="font-medium text-foreground/90">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1 block text-[11px]">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "focus-ring w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/70";

export function Btn({
  children,
  variant = "ghost",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-white hover:bg-primary-light",
        variant === "ghost" && "border border-border text-foreground hover:border-cyan/50 hover:text-cyan",
        variant === "danger" && "border border-sign-signal/40 text-sign-signal hover:bg-sign-signal/10",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function NetworkPicker({ value, onChange }: { value: Network[]; onChange: (next: Network[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {NETWORK_OPTIONS.map((n) => {
        const on = value.includes(n.key);
        return (
          <button
            key={n.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== n.key) : [...value, n.key])}
            className={cn(
              "focus-ring rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              on ? "border-cyan/60 bg-primary/15 text-cyan" : "border-border text-muted hover:text-foreground",
            )}
          >
            {n.label}
          </button>
        );
      })}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        tone === "error" && "border-sign-signal/40 bg-sign-signal/10 text-sign-signal",
        tone === "success" && "border-success/40 bg-success/10 text-success",
        tone === "info" && "border-border bg-background text-muted",
      )}
    >
      {children}
    </p>
  );
}

export function formatDate(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

/** datetime-local (hora local) → ISO */
export function localToIso(local: string) {
  return local ? new Date(local).toISOString() : null;
}
