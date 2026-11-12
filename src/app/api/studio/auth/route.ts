import { cookies } from "next/headers";
import { checkPassword, createSessionValue, SESSION_COOKIE } from "@/lib/studio/auth";
import { isStudioEnabled } from "@/lib/studio/config";

export const runtime = "nodejs";

// Intentos fallidos por IP (en memoria; suficiente para frenar fuerza bruta básica).
const failures = new Map<string, { count: number; until: number }>();

export async function POST(request: Request) {
  if (!isStudioEnabled()) return Response.json({ error: "studio_not_configured" }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const entry = failures.get(ip);
  if (entry && entry.count >= 5 && entry.until > Date.now()) {
    return Response.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (typeof body.password !== "string" || !checkPassword(body.password)) {
    const count = (entry && entry.until > Date.now() ? entry.count : 0) + 1;
    failures.set(ip, { count, until: Date.now() + 15 * 60 * 1000 });
    return Response.json({ error: "invalid_password" }, { status: 401 });
  }
  failures.delete(ip);

  const session = createSessionValue();
  const store = await cookies();
  store.set(SESSION_COOKIE, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: session.maxAge,
  });
  return Response.json({ ok: true });
}

export async function DELETE() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
