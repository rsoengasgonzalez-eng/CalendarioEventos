# Planes con Alma — Cloudflare Workers

PWA para organizar planes de un grupo de amigos. Esta versión corrige el despliegue en Cloudflare Workers para que la raíz y las rutas de la aplicación sirvan la interfaz web en lugar de devolver `{"error":"Ruta no encontrada"}`.

## Corrección aplicada

Cloudflare Workers ahora publica `public/` mediante **Static Assets**:

```toml
[assets]
directory = "./public"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = [ "/api/*" ]
```

Esto produce el siguiente comportamiento:

| URL | Resultado |
|---|---|
| `/` | Carga `public/index.html` |
| `/app.js`, `/styles.css`, `/images/*` | Sirve el recurso estático |
| `/plan/42`, `/calendar`, `/profile` | Devuelve `index.html` y la SPA resuelve la ruta |
| `/api/health` | Ejecuta el Worker |
| `/api/plans` | Ejecuta el Worker y utiliza D1 si está configurado |
| `/api/ruta-inexistente` | Devuelve un 404 JSON de API |

El código cliente también reconoce enlaces directos con ruta limpia (`/plan/42`) además de las rutas con hash (`/#plan/42`).

## Estructura

```text
planes-con-alma/
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── manifest.webmanifest
│   ├── sw.js
│   ├── icon.svg
│   ├── .assetsignore
│   └── images/
├── worker/
│   └── index.js
├── schema.sql
├── wrangler.toml
├── package.json
└── README.md
```

## Probar localmente

La interfaz no necesita dependencias:

```bash
npm run dev
```

Abre `http://localhost:4173`.

Para emular exactamente el enrutado de Workers se recomienda usar Wrangler:

```bash
npx wrangler dev
```

Comprueba:

- `http://localhost:8787/`
- `http://localhost:8787/plan/42`
- `http://localhost:8787/api/health`

## Desplegar

Desde la raíz del proyecto:

```bash
npx wrangler deploy
```

El nombre configurado es `calendarioeventos`, por lo que se actualizará el Worker con ese nombre en la cuenta autenticada.

Tras desplegar, verifica:

```bash
curl -I https://calendarioeventos.rsoengasgonzalez.workers.dev/
curl https://calendarioeventos.rsoengasgonzalez.workers.dev/api/health
```

La primera respuesta debe tener `content-type: text/html`; la segunda debe devolver JSON con `"ok": true`.

## D1 opcional

La aplicación visual funciona con almacenamiento local aunque D1 no esté configurado. Para datos compartidos entre dispositivos:

```bash
npx wrangler d1 create planes-con-alma
```

Añade a `wrangler.toml` el bloque que devuelve Cloudflare:

```toml
[[d1_databases]]
binding = "DB"
database_name = "planes-con-alma"
database_id = "ID_REAL_GENERADO_POR_CLOUDFLARE"
```

Inicializa y despliega:

```bash
npx wrangler d1 execute planes-con-alma --remote --file=schema.sql
npx wrangler deploy
```

Si D1 no está enlazado, `/api/plans` responde con un `503` descriptivo en vez de provocar un error interno; la interfaz continúa funcionando.

## Funcionalidades

- Inicio, búsqueda y categorías.
- Planes individuales, aforo y lista de espera.
- Creación, edición y eliminación.
- Comentarios y votaciones.
- Calendario y exportación `.ics`.
- Compartir en WhatsApp.
- Perfil por alias.
- PWA instalable y funcionamiento offline.
- Diseño móvil y de escritorio.
