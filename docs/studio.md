# Studio iA — imágenes con iA, carruseles y publicación en redes

App independiente (Next.js) con el panel en **`/studio`** (la raíz redirige allí), protegida con contraseña y fuera de los buscadores. Hace lo siguiente:

1. **Genera imágenes** con el generador de imágenes de OpenAI (el mismo motor que usa ChatGPT; modelo configurable con `OPENAI_IMAGE_MODEL`).
   - *Imagen suelta*: hasta 4 variaciones de un prompt.
   - *Carrusel*: Claude planifica las láminas (título, texto y prompt de imagen) y se genera una imagen por lámina con una dirección de arte común.
   - Imágenes de referencia opcionales (logo, producto o estilo).
2. **Se conecta con Carrusel Studio** (`carruseles.ia.nom.pe`): envía las imágenes generadas para componer el carrusel y recibe de vuelta las láminas finales.
3. **Publica en redes** con dos modos:
   - **Con aprobación**: el post queda en la cola *Por aprobar* (y n8n puede avisar por WhatsApp/email con enlaces para aprobar).
   - **Directo**: se publica al instante o a la hora programada.
4. Cada red se publica por la ruta que elijas en *Conexiones*:
   - **Directo (API oficial)**: Instagram y Facebook, conectados con un clic desde el panel (OAuth de Meta).
   - **Vía n8n**: cualquier red (LinkedIn, TikTok, X…) o cuando prefieras tu propio flujo.

```
 ┌──────────── /studio ────────────┐
 │ Crear → OpenAI Images (+Claude) │──► Carrusel Studio ──┐
 │ Cola de publicación (aprobación)│◄─────────────────────┘ (láminas finales)
 │ Conexiones (Meta · n8n)         │
 └───────────────┬─────────────────┘
                 ├─► Meta Graph API ─► Instagram / Facebook
                 └─► Webhook n8n ────► LinkedIn / TikTok / X / lo que quieras
```

## 1. Puesta en marcha

1. `npm install`, copia `.env.local.example` a `.env.local` (o a las variables del hosting) y arranca con `npm run dev` o `npm run build && npm start`.
2. Mínimo para entrar: `STUDIO_PASSWORD` y `STUDIO_SECRET` (≥ 32 caracteres, `openssl rand -hex 32`).
3. Para generar imágenes: `OPENAI_API_KEY`. Para planificar carruseles con iA: `ANTHROPIC_API_KEY` (la misma del chat web).
4. `STUDIO_PUBLIC_URL`: el dominio público (p. ej. `https://studio.tudominio.com`). Instagram y Facebook **descargan** las imágenes desde una URL pública, así que en `localhost` la publicación directa no funcionará.
5. Almacenamiento:
   - **Servidor propio / Docker / `next start`**: `STUDIO_STORAGE=fs` (por defecto). Guarda en `.data/studio` (ya está en `.gitignore`). Usa un volumen persistente.
   - **Vercel / serverless**: `STUDIO_STORAGE=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, y ejecuta `supabase/studio.sql` (crea la tabla `studio_kv` y el bucket público `studio-media`).

## 2. Conectar Instagram y Facebook (directo)

1. Crea una app en [developers.facebook.com](https://developers.facebook.com) (tipo *Business*) con los productos *Facebook Login for Business* e *Instagram Graph API*.
2. URI de redirección OAuth válida: `https://TU-DOMINIO/api/studio/connections/meta/callback`.
3. Permisos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management` (para producción requieren *App Review*).
4. Pon `META_APP_ID` y `META_APP_SECRET`, entra a `/studio` → **Conexiones** → **Conectar con Facebook**.
5. Si administras varias páginas, eliges cuál. El Instagram profesional vinculado a esa página se detecta solo.

El token de página se guarda **cifrado** (AES-256-GCM con `STUDIO_SECRET`). Alternativa sin OAuth: `META_PAGE_ID` + `META_PAGE_ACCESS_TOKEN` (+ `META_IG_USER_ID`).

Límites de Meta a tener en cuenta: carrusel de Instagram de 2 a 10 imágenes, JPG/PNG; ~50 publicaciones por cuenta cada 24 h.

## 3. Conectar n8n

Importa los ejemplos de `docs/n8n/`:

- **`studio-publicar.json`** — Webhook que recibe cada publicación. Configura su URL de producción en `N8N_PUBLISH_WEBHOOK_URL`.
- **`studio-programados.json`** — Llama cada 5 min a `/api/studio/cron` para publicar lo programado (cambia la URL y el `CRON_SECRET`).

### Payload que envía el Studio

```json
{
  "event": "publish",
  "networks": ["linkedin", "tiktok"],
  "post": {
    "id": "Xk3…",
    "caption": "Texto del post…",
    "format": "4:5",
    "isCarousel": true,
    "images": [{ "position": 1, "url": "https://…/lamina1.png", "title": "…", "text": "…" }],
    "scheduledAt": null,
    "links": {
      "approve": "https://studio.tudominio.com/api/studio/posts/Xk3…/approve",
      "reject": "https://studio.tudominio.com/api/studio/posts/Xk3…/reject",
      "results": "https://studio.tudominio.com/api/studio/posts/Xk3…/results",
      "panel": "https://studio.tudominio.com/studio?post=Xk3…"
    }
  }
}
```

- Cabecera `X-Studio-Signature`: HMAC-SHA256 del cuerpo con `N8N_WEBHOOK_SECRET` (hex).
- Respuesta esperada (opcional): `{ "results": [{ "network": "linkedin", "ok": true, "externalId": "…", "permalink": "…" }] }`.
- Si n8n publica más tarde, responde `200` y luego llama a `POST links.results` con `Authorization: Bearer STUDIO_API_KEY` y el mismo formato `{ results: [...] }`.
- Prueba la conexión desde **Conexiones → n8n → Probar** (envía `{ "event": "ping" }`).

### Aprobación por WhatsApp / email

Si defines `N8N_APPROVAL_WEBHOOK_URL`, cada post que queda *Por aprobar* se envía con `event: "approval_requested"` y el mismo `post`. El flujo de n8n puede mandar las imágenes por WhatsApp/email y, cuando la persona responda, llamar a:

```
POST {links.approve}   Authorization: Bearer STUDIO_API_KEY   { "note": "ok" }
POST {links.reject}    Authorization: Bearer STUDIO_API_KEY   { "note": "cambiar el título" }
```

Aprobar publica de inmediato (o a la hora programada).

## 4. Integración con Carrusel Studio

Carrusel Studio (`NEXT_PUBLIC_CARRUSEL_URL`) vive en otro repositorio. El Studio le abre:

```
https://carruseles.ia.nom.pe/?importar=<URL firmada>
```

Para que Carrusel Studio cargue las imágenes y las devuelva, hay que añadirle este código (o equivalente):

```ts
// En Carrusel Studio, al cargar la app:
const feedUrl = new URLSearchParams(location.search).get("importar");
if (feedUrl) {
  const feed = await fetch(feedUrl).then((r) => r.json());
  // feed = { id, format: "4:5", caption, networks, slides: [{ url, title, text }], returnUrl }
  for (const slide of feed.slides) {
    await agregarLaminaDesdeUrl(slide.url, { titulo: slide.title, texto: slide.text }); // función propia de la app
  }
  sessionStorage.setItem("studio_return_url", feed.returnUrl);
}

// En el botón "Enviar a publicar" (después de exportar las láminas a PNG):
async function enviarAlStudio(pngDataUrls: string[], caption?: string) {
  const returnUrl = sessionStorage.getItem("studio_return_url");
  if (!returnUrl) return;
  const res = await fetch(returnUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slides: pngDataUrls.map((dataUrl) => ({ dataUrl })), // o { url } si ya están subidas
      caption,                     // opcional
      mode: "approval",            // "approval" | "direct" | "draft"
      // networks: ["instagram"],  // opcional, si no usa las elegidas en el Studio
      // scheduledAt: "2026-11-05T15:00:00Z",
    }),
  });
  const { post } = await res.json(); // { id, status, results }
}
```

- El enlace está firmado con `STUDIO_SECRET`: no hace falta poner la API key en el navegador.
- CORS permitido para `NEXT_PUBLIC_CARRUSEL_URL` (y orígenes extra en `STUDIO_CORS_ORIGINS`).
- Carrusel Studio también puede crear publicaciones nuevas desde el servidor con `POST /api/studio/posts` + `Authorization: Bearer STUDIO_API_KEY` y `source: "carrusel"`.
- Y puede **generar imágenes** directamente llamando a `POST /api/studio/generate` (misma API key), así deja de depender solo de imágenes subidas.

## 5. API (para el Dashboard 360, n8n u otras apps)

Autenticación: cookie de sesión del panel **o** `Authorization: Bearer STUDIO_API_KEY`.

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/api/studio/generate` | `{ prompt, n, style, format, quality }` o `{ slides: [{prompt,title,text}], style, format, quality }` → `{ media: [...] }`. Multipart con `payload` + `references` para imágenes de referencia. |
| POST | `/api/studio/plan` | `{ topic, slides, brand?, tone?, network? }` → plan de carrusel (Claude). |
| GET | `/api/studio/posts?status=` | Lista la cola. |
| POST | `/api/studio/posts` | `{ caption, media: [{url}\|{dataUrl}], networks, mode: "approval"\|"direct", scheduledAt?, format?, draft? }` |
| PATCH | `/api/studio/posts/:id` | Editar `caption`, `networks`, `scheduledAt`, `mediaOrder`. |
| POST | `/api/studio/posts/:id/approve` · `/reject` · `/publish` | Aprobar, rechazar, publicar ya / reintentar fallidas. |
| POST | `/api/studio/posts/:id/results` | Callback de n8n (solo API key). |
| POST | `/api/studio/carousel` | Crea un borrador y devuelve `openUrl` para Carrusel Studio. |
| GET/POST | `/api/studio/cron` | Publica programados (`Bearer CRON_SECRET` o API key). |

Formatos: `4:5`, `1:1`, `9:16`, `16:9`. Calidad: `low`, `medium`, `high`. Redes: `instagram`, `facebook`, `linkedin`, `tiktok`, `x`.

### Estados de una publicación

`draft` → `pending_approval` → `approved` → `publishing` → `published` · `partial` (alguna red falló, se puede reintentar) · `failed` · `rejected`.

## 6. Notas

- Las imágenes se sirven públicamente (nombres aleatorios) porque las redes y n8n deben descargarlas.
- Las publicaciones programadas necesitan que algo llame a `/api/studio/cron` (n8n, Vercel Cron o un cron del servidor).
- Costos: cada imagen consume créditos de OpenAI según calidad y tamaño; usa *Borrador* para iterar y *Alta* para la versión final.
