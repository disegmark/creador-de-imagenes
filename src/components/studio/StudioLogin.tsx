"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { api, Btn, inputClass, Notice } from "./shared";

export function StudioLogin({ ssoError = false }: { ssoError?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(ssoError ? "El acceso desde el Dashboard caducó o no es válido. Vuelve a abrir la app desde el Dashboard o entra con tu contraseña." : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api("/api/studio/auth", { method: "POST", json: { password } });
      router.refresh();
    } catch {
      setError("Contraseña incorrecta o demasiados intentos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-background-elevated p-6">
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-cyan" />
          <h1 className="font-display text-lg font-semibold">Studio de contenido</h1>
        </div>
        <p className="text-sm text-muted">Genera imágenes con iA, arma carruseles y publica en tus redes.</p>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className={inputClass}
          aria-label="Contraseña"
        />
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Btn type="submit" variant="primary" className="w-full" disabled={loading || !password}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Entrar
        </Btn>
      </form>
    </div>
  );
}
