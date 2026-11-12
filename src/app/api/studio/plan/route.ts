import Anthropic from "@anthropic-ai/sdk";
import { authorize, notConfigured, unauthorized } from "@/lib/studio/auth";
import { studioConfig } from "@/lib/studio/config";
import { planCarousel } from "@/lib/studio/planner";
import { isStudioEnabled } from "@/lib/studio/workspaces";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Planifica un carrusel con Claude: guion por lámina + prompts de imagen + caption. */
export async function POST(request: Request) {
  if (!isStudioEnabled()) return notConfigured();
  if (!(await authorize(request))) return unauthorized();
  if (!studioConfig.anthropicKey) return Response.json({ error: "planner_not_configured" }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 1500) : "";
  if (!topic) return Response.json({ error: "topic_required" }, { status: 422 });

  try {
    const plan = await planCarousel({
      topic,
      slides: Math.max(1, Math.min(10, Number(body.slides) || 5)),
      network: typeof body.network === "string" ? body.network.slice(0, 40) : "Instagram",
      brand: typeof body.brand === "string" ? body.brand.slice(0, 300) : undefined,
      tone: typeof body.tone === "string" ? body.tone.slice(0, 200) : undefined,
    });
    return Response.json({ plan });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: "rate_limited" }, { status: 429 });
    if (error instanceof Anthropic.APIError) {
      console.error(`[studio/plan] API error ${error.status}`, error.message);
      return Response.json({ error: "upstream_error" }, { status: 502 });
    }
    console.error("[studio/plan]", error);
    return Response.json({ error: "plan_failed", message: (error as Error).message }, { status: 500 });
  }
}
