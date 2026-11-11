# Planes con Alma — Cloudflare Workers + D1

Aplicación PWA para crear planes y permitir que las personas se apunten. La aplicación empieza vacía y utiliza **Cloudflare D1 como fuente de verdad** para planes, personas, asistentes y comentarios.

## Qué se ha corregido

- Crear un plan ejecuta `POST /api/plans` e inserta una fila en `app_plans`.
- Tras crear o modificar datos, el cliente vuelve a consultar `GET /api/bootstrap` y actualiza la pantalla inmediatamente.
- Los planes ya no dependen de `localStorage`; solo el alias personal del dispositivo se guarda localmente.
- Apuntarse crea o reutiliza una persona en `app_people` y registra la asistencia en `app_attendees`.
- La lista de espera también se guarda en `app_attendees`, con estado `waiting`.
- Los comentarios se guardan en `app_comments`.
- Editar y eliminar modifican D1.
- El Service Worker **nunca almacena `/api/*` en caché**, evitando que aparezcan agendas antiguas o vacías después de guardar.
- Un segundo teléfono o navegador consulta las mismas tablas y ve los cambios persistidos.

## Tablas D1

```text
app_plans       planes y sus datos
app_people      alias de personas reales
app_attendees   relación persona-plan y estado confirmed/waiting
app_comments    comentarios asociados a persona y plan
```

El Worker ejecuta `CREATE TABLE IF NOT EXISTS` al usar la API. `schema.sql` contiene el mismo esquema para inicialización explícita.

## Configurar la base D1 ya creada

El Worker espera un binding llamado exactamente `DB`.

### Configuración automática recomendada

Autentícate y deja que el proyecto encuentre por nombre la base `planes-con-alma`:

```bash
npx wrangler login
npm run configure:d1
```

El script consulta las bases de la cuenta, encuentra su UUID y añade a `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "planes-con-alma"
database_id = "UUID_REAL_DE_CLOUDFLARE"
```

Si la base creada tiene otro nombre:

```bash
npm run configure:d1 -- nombre-real-de-la-base
```

También se puede copiar manualmente el UUID desde **Cloudflare → Workers & Pages → D1**.

## Inicializar y desplegar

Para la base `planes-con-alma`:

```bash
npm run deploy:d1
```

Equivale a:

```bash
npm run configure:d1
npx wrangler d1 execute planes-con-alma --remote --file=schema.sql
npx wrangler deploy
```

Si la base tiene otro nombre, ejecuta:

```bash
npm run configure:d1 -- nombre-real-de-la-base
npx wrangler d1 execute nombre-real-de-la-base --remote --file=schema.sql
npx wrangler deploy
```

## Comprobar el despliegue

```bash
curl https://calendarioeventos.rsoengasgonzalez.workers.dev/api/health
```

Debe responder:

```json
{
  "ok": true,
  "service": "planes-con-alma",
  "staticAssets": true,
  "database": true
}
```

Consulta los datos compartidos:

```bash
curl https://calendarioeventos.rsoengasgonzalez.workers.dev/api/bootstrap
```

Una instalación vacía devuelve:

```json
{"plans":[],"peopleCount":0}
```

Después de crear un plan, debe aparecer dentro de `plans`.

## API

| Método | Ruta | Operación D1 |
|---|---|---|
| `GET` | `/api/health` | Comprueba el binding `DB` |
| `GET` | `/api/bootstrap` | Lee planes, asistentes y comentarios |
| `POST` | `/api/plans` | Inserta un plan |
| `PUT` | `/api/plans/:id` | Actualiza un plan |
| `DELETE` | `/api/plans/:id` | Elimina plan, asistentes y comentarios |
| `POST` | `/api/plans/:id/attendance` | Apunta/cancela una persona |
| `POST` | `/api/plans/:id/comments` | Inserta un comentario |
| `PUT` | `/api/people/rename` | Cambia el alias de una persona |

## Rutas web

Workers Static Assets publica `public/` y mantiene el fallback SPA:

- `/` carga la aplicación.
- `/plan/42`, `/calendar` y `/profile` cargan `index.html`.
- `/api/*` pasa primero por `worker/index.js`.

## Desarrollo local

La UI estática puede abrirse con:

```bash
npm run dev
```

Para probar la API D1 local:

```bash
npm run configure:d1
npx wrangler dev
```

## Estructura

```text
planes-con-alma/
├── public/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── sw.js
│   └── images/
├── worker/index.js
├── scripts/configure-d1.mjs
├── schema.sql
├── wrangler.toml
├── package.json
└── README.md
```

## Múltiples planes y creación desde Calendario (v2.1)

- Cada apertura de `#create` utiliza siempre `POST /api/plans` y genera un registro nuevo con un ID D1 independiente.
- La edición utiliza una ruta separada, `#edit/:id`, y solo esa ruta ejecuta `PUT /api/plans/:id`.
- Pasar desde edición al botón **+ Crear** abre un formulario vacío; nunca reutiliza el ID editado.
- En Calendario, cada día es un botón de creación. Al pulsarlo se abre `#create/AAAA-MM-DD` con la fecha preseleccionada.
- Calendario incluye botones visibles **Crear plan** y **Añadir plan**.
- Después de cada `POST` o `PUT`, la aplicación consulta de nuevo `/api/bootstrap`; el estado actualizado queda disponible inmediatamente en Inicio, Explorar y Calendario.
- Varios planes pueden compartir la misma fecha. El calendario muestra un punto por plan y la agenda lateral los enumera de forma independiente.
