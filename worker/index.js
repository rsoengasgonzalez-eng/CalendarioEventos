const apiHeaders = {
  "content-type": "application/json; charset=UTF-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: apiHeaders });

const databaseRequired = () =>
  json(
    {
      error: "Base de datos no configurada",
      detail: "La aplicación web funciona, pero las rutas de datos compartidos requieren enlazar Cloudflare D1 como DB.",
    },
    503,
  );

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...apiHeaders,
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "planes-con-alma",
      staticAssets: Boolean(env.ASSETS),
      database: Boolean(env.DB),
    });
  }

  if (url.pathname === "/api/plans" && request.method === "GET") {
    if (!env.DB) return databaseRequired();

    const { results } = await env.DB.prepare(
      `SELECT p.*,
        COUNT(CASE WHEN pa.status = 'confirmed' THEN 1 END) AS attendee_count
       FROM plans p
       LEFT JOIN plan_attendees pa ON pa.plan_id = p.id
       WHERE p.status = 'published'
       GROUP BY p.id
       ORDER BY p.starts_at`,
    ).all();

    return json(results);
  }

  if (url.pathname === "/api/plans" && request.method === "POST") {
    if (!env.DB) return databaseRequired();

    const plan = await request.json();
    const result = await env.DB.prepare(
      `INSERT INTO plans
       (owner_id, title, category, starts_at, location, address, capacity,
        price, description, image_url, allow_waitlist)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        plan.owner_id,
        plan.title,
        plan.category,
        plan.starts_at,
        plan.location,
        plan.address || "",
        plan.capacity || 20,
        plan.price || "",
        plan.description || "",
        plan.image_url || "",
        plan.allow_waitlist === false ? 0 : 1,
      )
      .run();

    return json({ id: result.meta.last_row_id }, 201);
  }

  const planMatch = url.pathname.match(/^\/api\/plans\/(\d+)$/);
  if (planMatch && request.method === "GET") {
    if (!env.DB) return databaseRequired();

    const plan = await env.DB.prepare("SELECT * FROM plans WHERE id = ?")
      .bind(planMatch[1])
      .first();

    if (!plan) return json({ error: "Plan no encontrado" }, 404);

    const { results: attendees } = await env.DB.prepare(
      `SELECT u.id, u.alias, u.avatar_url, pa.status, pa.joined_at
       FROM plan_attendees pa
       JOIN users u ON u.id = pa.user_id
       WHERE pa.plan_id = ?
       ORDER BY pa.joined_at`,
    )
      .bind(planMatch[1])
      .all();

    return json({ ...plan, attendees });
  }

  return json({ error: "Ruta API no encontrada" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, url);
      }

      // Respaldo defensivo. Con run_worker_first=["/api/*"], Cloudflare sirve
      // normalmente estos recursos sin ejecutar el Worker. Si la configuración
      // cambia a worker-first, esta línea conserva la aplicación y sus rutas.
      if (env.ASSETS) return env.ASSETS.fetch(request);

      return json({ error: "Recursos web no configurados" }, 503);
    } catch (error) {
      console.error("Worker request failed", error);
      return json({ error: "Error interno" }, 500);
    }
  },
};
