"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Inbox, LogOut, Plug, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CreatePanel } from "./CreatePanel";
import { QueuePanel } from "./QueuePanel";
import { ConnectionsPanel } from "./ConnectionsPanel";

type Tab = "crear" | "cola" | "conexiones";

const TABS: Array<{ key: Tab; label: string; icon: typeof Sparkles }> = [
  { key: "crear", label: "Crear", icon: Sparkles },
  { key: "cola", label: "Cola de publicación", icon: Inbox },
  { key: "conexiones", label: "Conexiones", icon: Plug },
];

export function StudioApp({ workspaceName, initialTab, focusPostId, callback }: { workspaceName: string; initialTab: Tab; focusPostId: string | null; callback: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [refreshKey, setRefreshKey] = useState(0);

  async function logout() {
    await fetch("/api/studio/auth", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-lg font-semibold">
          Studio <span className="text-cyan">iA</span>
          <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[11px] font-normal text-muted" title="Espacio de trabajo">
            {workspaceName}
          </span>
        </h1>
        <nav className="flex flex-wrap gap-1.5 sm:ml-6" aria-label="Secciones">
          {TABS.map(({ key, label, icon: Ico }) => (
            <button
              key={key}
              type="button"
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "focus-ring flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm",
                tab === key ? "border-cyan/60 bg-primary/15 text-cyan" : "border-border text-muted hover:text-foreground",
              )}
            >
              <Ico className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
        <button type="button" onClick={logout} className="focus-ring ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted hover:text-foreground">
          <LogOut className="h-3.5 w-3.5" /> Salir
        </button>
      </header>

      {/* Los paneles se mantienen montados para no perder lo generado al cambiar de pestaña. */}
      <div hidden={tab !== "crear"}>
        <CreatePanel onPublished={() => setRefreshKey((k) => k + 1)} />
      </div>
      <div hidden={tab !== "cola"}>
        <QueuePanel refreshKey={refreshKey} focusId={focusPostId} />
      </div>
      <div hidden={tab !== "conexiones"}>{tab === "conexiones" || callback ? <ConnectionsPanel callback={callback} /> : null}</div>
    </div>
  );
}
