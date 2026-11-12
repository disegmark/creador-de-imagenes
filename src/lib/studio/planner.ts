import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

export type CarouselPlan = {
  caption: string;
  hashtags: string[];
  style: string;
  slides: Array<{ title: string; text: string; imagePrompt: string }>;
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["caption", "hashtags", "style", "slides"],
  properties: {
    caption: { type: "string", description: "Texto del post en español, listo para publicar (sin hashtags)." },
    hashtags: { type: "array", items: { type: "string" } },
    style: { type: "string", description: "Dirección de arte común a todas las láminas (en inglés, para el generador)." },
    slides: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "text", "imagePrompt"],
        properties: {
          title: { type: "string", description: "Título corto de la lámina en español." },
          text: { type: "string", description: "Texto de apoyo breve en español (puede ir vacío)." },
          imagePrompt: {
            type: "string",
            description: "Prompt en inglés para la imagen de fondo. Sin texto dentro de la imagen; dejar espacio para el título.",
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `Eres director creativo de redes sociales para negocios en Perú y Latinoamérica.
Planificas carruseles: cada lámina tiene un título breve, un texto de apoyo y un prompt de imagen.
Las imágenes se generan con un modelo de imágenes y luego Carrusel Studio superpone el texto, así que
los prompts de imagen deben describir solo la escena visual, coherente entre láminas, sin texto incrustado
y con espacio negativo para el título. La primera lámina es el gancho y la última un llamado a la acción.`;

export async function planCarousel(input: {
  topic: string;
  slides: number;
  network: string;
  brand?: string;
  tone?: string;
}): Promise<CarouselPlan> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: PLAN_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          `Tema: ${input.topic}`,
          `Número de láminas: ${input.slides}`,
          `Red social: ${input.network}`,
          input.brand ? `Marca / negocio: ${input.brand}` : "",
          input.tone ? `Tono: ${input.tone}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("plan_refused");
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("plan_empty");
  const plan = JSON.parse(text.text) as CarouselPlan;
  plan.slides = plan.slides.slice(0, input.slides);
  return plan;
}
