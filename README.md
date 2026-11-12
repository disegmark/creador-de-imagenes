# Studio iA

Genera imágenes con el generador de imágenes de OpenAI (el mismo motor de ChatGPT), planifica carruseles con Claude, los envía a **Carrusel Studio** y los publica en redes sociales — con **aprobación** o **publicación directa/programada** — a través de **Meta (Instagram + Facebook)** conectado desde el panel o de **n8n**.

```bash
npm install
cp .env.local.example .env.local   # completa STUDIO_PASSWORD, STUDIO_SECRET, OPENAI_API_KEY…
npm run dev                         # http://localhost:3000/studio
```

Guía completa (variables, Meta, n8n, Carrusel Studio y API): [`docs/studio.md`](docs/studio.md).

- `supabase/studio.sql` — almacenamiento para Vercel/serverless.
- `docs/n8n/` — workflows de ejemplo (publicar y programados).
