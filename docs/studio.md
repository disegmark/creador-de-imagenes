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
2. Mínimo para entrar: `STUDIO_SECRET` (≥ 32 caracteres, `openssl rand -hex 32`) y al menos un espacio en `STUDIO_WORKSPACES` (ver sección 1.1).
3. Para generar imágenes: `OPENAI_API_KEY`. Para planificar carruseles con iA: `ANTHROPIC_API_KEY` (la misma del chat web).
4. `STUDIO_PUBLIC_URL`: el dominio público (p. ej. `https://studio.tudominio.com`). Instagram y Facebook **descargan** las imágenes desde una URL pública, así que en `localhost` la publicación directa no funcionará.
5. Almacenamiento:
   - **Servidor propio / Docker / `next start`**: `STUDIO_STORAGE=fs` (por defecto). Guarda en `.data/studio` (ya está en `.gitignore`). Usa un volumen persistente.
   - **Vercel / serverless**: `STUDIO_STORAGE=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, y ejecuta `supabase/studio.sql` (crea la tabla `studio_kv` y el bucket público `studio-media`).

### 1.1 Espacios de trabajo y entrada desde los dashboards

Cada sistema o dashboard que usa la app (iA 360, CG 360, …) es un **espacio de trabajo** separado, con su propia cola, conexiones de Meta y n8n, ajustes y clave de API. Un espacio nunca ve ni publica lo de otro.

```env
STUDIO_WORKSPACES=[{"id":"ia360","nombre":"iA 360","sso_secret":"<openssl rand -hex 32>","sso_usuario":"ia360","api_key":"<openssl rand -hex 24>"},{"id":"cg360","nombre":"CG 360","sso_secret":"<otro>","sso_usuario":"cg360","api_key":"<otra>"}]
```

| Campo | Uso |
| --- | --- |
| `id` | Identificador corto (minúsculas, números, `-`, `_`). |
| `nombre` | Nombre visible en el panel. |
| `password` | Opcional: entrada manual con contraseña (única por espacio). |
| `sso_secret` | Secreto **propio** del espacio para verificar el pase del Dashboard (≥ 32 caracteres). |
| `sso_usuario` | Usuario que el Dashboard pone en el pase (`u`). Por defecto, el `id`. |
| `api_key` | Clave del espacio para n8n, Carrusel Studio o el Dashboard (`Authorization: Bearer`). |
| `n8n_publish_url`, `n8n_approval_url`, `n8n_secret` | Opcionales: n8n propio del espacio (si faltan, se usan las variables globales). |

Sin `STUDIO_WORKSPACES`, la app sigue funcionando con un único espacio `principal` tomado de `STUDIO_PASSWORD`, `STUDIO_API_KEY`, `STUDIO_SSO_SECRET` y `STUDIO_SSO_USUARIO`.

**Entrada automática (mismo esquema que el resto de apps del Dashboard).** El Dashboard redirige a `https://imagenes.ia.nom.pe/sso?t=<pase>`, donde el pase es `base64url({"app","u","exp"})` + `.` + `base64url(HMAC-SHA256(secreto, cuerpo))` y dura 30 segundos. La app:

- exige `app` = `STUDIO_SSO_APP` (por defecto `creador-imagenes`);
- busca el espacio cuyo `sso_usuario` coincide con `u` y verifica la firma con **su** `sso_secret` (un panel no puede entrar en el espacio de otro);
- rechaza pases caducados o ya usados, y crea una sesión propia fijada a ese espacio.

En el Dashboard (`agente-ia-360`) basta con añadir la app a `server/routes/sso.js` y a `client/src/lib/appsIntegradas.js`:

```js
// server/routes/sso.js → APPS
"creador-imagenes": {
  secreto: () => process.env.SSO_SECRET_IMAGENES || "",
  pase: "creador-imagenes",
  url: () => process.env.IMAGENES_URL || "https://imagenes.ia.nom.pe",
  ruta: "/sso",
  usuario: () => process.env.SSO_USUARIO_IMAGENES || "ia360",
},

// client/src/lib/appsIntegradas.js → APPS_INTEGRADAS
{ id: "creador-imagenes", seccion: "marketing", nombre: "Creador de imágenes",
  descripcion: "Genera imágenes y carruseles con iA y publícalos en redes con aprobación.",
  url: "https://imagenes.ia.nom.pe/studio", sso: true },
```

`SSO_SECRET_IMAGENES` del Dashboard = `sso_secret` del espacio `ia360` aquí. Cada panel (cg360, …) usa su propio secreto y usuario.

Si el Dashboard embebe la app en un iframe desde el mismo dominio (`*.ia.nom.pe`), la cookie `lax` funciona. Si la embebe desde otro dominio, usa `STUDIO_COOKIE_SAMESITE=none` (requiere HTTPS).

## 2. Conectar Instagram y Facebook (directo)

1. Crea una app en [developers.facebook.com](https://developers.facebook.com) (tipo *Business*) con los productos *Facebook Login for Business* e *Instagram Graph API*.
2. URI de redirección OAuth válida: `https://TU-DOMINIO/api/studio/connections/meta/callback`.
3. Permisos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management` (para producción requieren *App Review*).
4. Pon `META_APP_ID` y `META_APP_SECRET`, entra a `/studio` → **Conexiones** → **Conectar con Facebook**.
5. Si administras varias páginas, eliges cuál. El Instagram profesional vinculado a esa página se detecta solo.

Cada espacio conecta **su propia** página e Instagram. El token de página se guarda **cifrado** (AES-256-GCM con `STUDIO_SECRET`). Alternativa sin OAuth (solo para el espacio `principal`): `META_PAGE_ID` + `META_PAGE_ACCESS_TOKEN` (+ `META_IG_USER_ID`).

Límites de Meta a tener en cuenta: carrusel de Instagram de 2 a 10 imágenes, JPG/PNG; ~50 publicaciones por cuenta cada 24 h.

Instagram puede tardar varios minutos en procesar un carrusel. La app espera hasta ~2,5 min; si no termina, el post queda **Esperando confirmación** con los contenedores guardados y la siguiente pasada del cron (o "Reintentar") lo publica sin volver a subir las imágenes.

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
- El payload incluye `workspace` (id del espacio) para que un mismo n8n sepa a qué cuentas publicar.
- Respuesta esperada: `{ "results": [{ "network": "linkedin", "ok": true, "externalId": "…", "permalink": "…" }] }`.
- Si n8n responde `2xx` **sin** resultado para una red, esa red queda **Esperando confirmación** (nunca se marca como publicada) y no se vuelve a enviar sola, para no duplicar. n8n debe llamar luego a `POST links.results` con `Authorization: Bearer <api_key del espacio>` y `{ results: [...] }`.
- Si n8n no responde (timeout de 2 min o error de red), la red también queda pendiente de confirmación, no se reenvía.
- Prueba la conexión desde **Conexiones → n8n → Probar** (envía `{ "event": "ping" }`).

### Aprobación por WhatsApp / email

Si defines `N8N_APPROVAL_WEBHOOK_URL`, cada post que queda *Por aprobar* se envía con `event: "approval_requested"` y el mismo `post`. El flujo de n8n puede mandar las imágenes por WhatsApp/email y, cuando la persona responda, llamar a:

```
POST {links.approve}   Authorization: Bearer <api_key del espacio>   { "note": "ok" }
POST {links.reject}    Authorization: Bearer <api_key del espacio>   { "note": "cambiar el título" }
```

Aprobar publica de inmediato (o a la hora programada).

## 4. Integración con Carrusel Studio

Carrusel Studio (`NEXT_PUBLIC_CARRUSEL_URL`) vive en otro repositorio. El Studio le abre:

```
https://carruseles.ia.nom.pe/?importar=<URL firmada, válida 24 h>
```

Para que Carrusel Studio cargue las imágenes y las devuelva, hay que añadirle este código (o equivalente):

```ts
// En Carrusel Studio, al cargar la app:
const feedUrl = new URLSearchParams(location.search).get("importar");
if (feedUrl) {
  // Quitar el enlace de la barra de direcciones (y del historial) apenas se lee.
  history.replaceState(null, "", location.pathname);
  const feed = await fetch(feedUrl, { referrerPolicy: "no-referrer" }).then((r) => r.json());
  // feed = { id, format: "4:5", caption, networks, slides: [{ url, title, text }], returnUrl, expiresAt }
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
      mode: "approval",            // "approval" (por aprobar) | "draft" (seguir editando)
      // networks: ["instagram"],  // opcional, si no usa las elegidas en el Studio
    }),
  });
  sessionStorage.removeItem("studio_return_url");
  const { post } = await res.json(); // { id, status: "pending_approval" | "draft" }
}
```

- El enlace está firmado (espacio + post + caducidad) y **vale 24 h**. No hace falta poner la API key en el navegador.
- El enlace **nunca publica**: lo máximo que hace es dejar el post *Por aprobar*. La publicación se decide en el panel (o con la clave de API del espacio).
- Solo funciona mientras el post es un borrador: al devolver las láminas deja de servir. Desde la cola se puede pedir un enlace nuevo para un borrador ("Carrusel Studio"); los enlaces no aparecen en el listado de publicaciones.
- CORS permitido para `NEXT_PUBLIC_CARRUSEL_URL` (y orígenes extra en `STUDIO_CORS_ORIGINS`).
- Carrusel Studio también puede crear publicaciones nuevas desde su servidor con `POST /api/studio/posts` + `Authorization: Bearer <api_key del espacio>` y `source: "carrusel"`.
- Y puede **generar imágenes** directamente llamando a `POST /api/studio/generate` (misma clave), así deja de depender solo de imágenes subidas.

## 5. API (para el Dashboard 360, n8n u otras apps)

Autenticación: cookie de sesión del panel **o** `Authorization: Bearer <api_key del espacio>`. Todo lo que se crea o consulta queda dentro de ese espacio.

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/api/studio/generate` | `{ prompt, n, style, format, quality }` o `{ slides: [{prompt,title,text,index?}], style, format, quality }` → `{ media: [...], failed: [...] }`. Se generan de a `STUDIO_IMAGE_CONCURRENCY` (3) y cada imagen se guarda al terminar: si alguna falla, las demás se conservan. Multipart con `payload` + `references` para imágenes de referencia. |
| POST | `/api/studio/plan` | `{ topic, slides, brand?, tone?, network? }` → plan de carrusel (Claude). |
| GET | `/api/studio/posts?status=` | Lista la cola. |
| POST | `/api/studio/posts` | `{ caption, media: [{url}\|{dataUrl}], networks, mode: "approval"\|"direct", scheduledAt?, format?, draft? }` |
| PATCH | `/api/studio/posts/:id` | Editar `caption`, `networks`, `scheduledAt`, `mediaOrder`. |
| POST | `/api/studio/posts/:id/approve` · `/reject` · `/publish` | Aprobar, rechazar, publicar ya / reintentar fallidas. `/publish` sobre algo no aprobado solo se permite con sesión del panel. |
| POST | `/api/studio/posts/:id/carousel` | Enlace nuevo (24 h) a Carrusel Studio para un borrador. |
| POST | `/api/studio/posts/:id/results` | Callback de n8n (solo API key). |
| POST | `/api/studio/carousel` | Crea un borrador y devuelve `openUrl` para Carrusel Studio. |
| GET/POST | `/api/studio/cron` | Publica programados, retoma posts cortados y termina Instagram pendiente. `Bearer CRON_SECRET` = todos los espacios; clave de API = solo ese espacio. |

Formatos: `4:5`, `1:1`, `9:16`, `16:9`. Calidad: `low`, `medium`, `high`. Redes: `instagram`, `facebook`, `linkedin`, `tiktok`, `x`.

### Estados de una publicación

`draft` → `pending_approval` → `approved` → `publishing` → `published` · `sent` (entregado, esperando confirmación de n8n o Instagram) · `partial` (alguna red falló, se puede reintentar) · `failed` · `rejected`.

- Un post nunca queda trabado en `publishing`: cualquier error lo saca de ahí, y si el proceso se corta (reinicio, timeout), a los 10 minutos el cron o "Reintentar" lo retoma.
- Las escrituras usan control de versión (también en Supabase con varias instancias): dos aprobaciones simultáneas publican una sola vez.

## 6. Notas

- Las imágenes se sirven públicamente (nombres aleatorios) porque las redes y n8n deben descargarlas.
- Las publicaciones programadas necesitan que algo llame a `/api/studio/cron` (n8n, Vercel Cron o un cron del servidor).
- Costos: cada imagen consume créditos de OpenAI según calidad y tamaño; usa *Borrador* para iterar y *Alta* para la versión final.
