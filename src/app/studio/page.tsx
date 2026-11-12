import type { Metadata } from "next";
import { connection } from "next/server";
import { StudioApp } from "@/components/studio/StudioApp";
import { StudioLogin } from "@/components/studio/StudioLogin";
import { hasSession } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";

export const metadata: Metadata = {
  title: "Studio",
  robots: { index: false, follow: false },
};

type Tab = "crear" | "cola" | "conexiones";

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Las variables de entorno y la sesión se leen en cada petición, nunca en el build.
  await connection();
  if (!isStudioEnabled()) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-xl font-semibold">Studio no configurado</h1>
        <p className="mt-3 text-sm text-muted">
          Define <code>STUDIO_PASSWORD</code> y <code>STUDIO_SECRET</code> (mín. 32 caracteres) en las variables de entorno del servidor. Ver{" "}
          <code>docs/studio.md</code>.
        </p>
      </div>
    );
  }

  if (!(await hasSession())) return <StudioLogin />;

  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : null);
  const post = one("post");
  const callbackKey = ["connected", "error", "select"].find((k) => one(k));
  const callback = callbackKey ? `${callbackKey}=${one(callbackKey)}` : null;
  const tabParam = one("tab");
  const initialTab: Tab = callback ? "conexiones" : post ? "cola" : tabParam === "cola" || tabParam === "conexiones" ? tabParam : "crear";

  return <StudioApp initialTab={initialTab} focusPostId={post} callback={callback} />;
}
