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
      error: "Base de datos D1 no configurada",
      detail: "Enlaza la base de datos al Worker utilizando el binding DB.",
    },
    503,
  );

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      plan_date TEXT NOT NULL,
      plan_time TEXT NOT NULL,
      location TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 20 CHECK (capacity >= 1),
      price TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      allow_waitlist INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS app_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL COLLATE NOCASE UNIQUE,
      zone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS app_attendees (
      plan_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'waiting')),
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (plan_id, person_id),
      FOREIGN KEY (plan_id) REFERENCES app_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES app_people(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS app_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      person_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES app_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES app_people(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_app_plans_date ON app_plans(plan_date, plan_time)`,
    `CREATE INDEX IF NOT EXISTS idx_app_attendees_plan ON app_attendees(plan_id, status, joined_at)`,
    `CREATE INDEX IF NOT EXISTS idx_app_comments_plan ON app_comments(plan_id, created_at)`,
  ];
  for (const statement of statements) await db.prepare(statement).run();
  schemaReady = true;
}

const normalizePlan = (row) => ({
  id: Number(row.id),
  title: row.title,
  category: row.category,
  date: row.plan_date,
  time: row.plan_time,
  location: row.location,
  address: row.address || "",
  capacity: Number(row.capacity),
  price: row.price || "",
  description: row.description || "",
  image: row.image_url || "/images/hero_xmadrid.jpg",
  allowWaitlist: Boolean(row.allow_waitlist),
  createdBy: row.created_by || "Administrador",
  ownerLocal: true,
  featured: false,
  attendees: [],
  waitlist: [],
  comments: [],
});

async function getPerson(db, alias) {
  const cleanAlias = String(alias || "").trim().slice(0, 30);
  if (!cleanAlias) throw new Error("ALIAS_REQUIRED");
  await db.prepare(
    `INSERT INTO app_people (alias) VALUES (?)
     ON CONFLICT(alias) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
  ).bind(cleanAlias).run();
  return db.prepare("SELECT id, alias, zone FROM app_people WHERE alias = ? COLLATE NOCASE")
    .bind(cleanAlias).first();
}

async function listPlans(db) {
  await ensureSchema(db);
  const [planResult, attendeeResult, commentResult] = await db.batch([
    db.prepare("SELECT * FROM app_plans ORDER BY plan_date, plan_time, id"),
    db.prepare(
      `SELECT a.plan_id, a.status, a.joined_at, p.alias
       FROM app_attendees a JOIN app_people p ON p.id = a.person_id
       ORDER BY a.joined_at, p.alias`,
    ),
    db.prepare(
      `SELECT c.id, c.plan_id, c.body, c.created_at, p.alias
       FROM app_comments c JOIN app_people p ON p.id = c.person_id
       ORDER BY c.created_at, c.id`,
    ),
  ]);
  const plans = (planResult.results || []).map(normalizePlan);
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  for (const row of attendeeResult.results || []) {
    const plan = byId.get(Number(row.plan_id));
    if (!plan) continue;
    (row.status === "waiting" ? plan.waitlist : plan.attendees).push(row.alias);
  }
  for (const row of commentResult.results || []) {
    const plan = byId.get(Number(row.plan_id));
    if (!plan) continue;
    plan.comments.push({
      id: Number(row.id),
      name: row.alias,
      text: row.body,
      time: new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(`${row.created_at}Z`)),
    });
  }
  if (plans.length) plans[0].featured = true;
  return plans;
}

function validatePlan(plan) {
  const required = ["title", "category", "date", "time", "location", "address", "description"];
  return required.every((field) => String(plan?.[field] || "").trim()) && Number(plan.capacity) >= 1;
}

async function handleApi(request, env, url) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...apiHeaders,
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "planes-con-alma", staticAssets: Boolean(env.ASSETS), database: Boolean(env.DB) });
  }
  if (!env.DB) return databaseRequired();
  await ensureSchema(env.DB);

  if ((url.pathname === "/api/bootstrap" || url.pathname === "/api/plans") && request.method === "GET") {
    const plans = await listPlans(env.DB);
    const peopleRow = await env.DB.prepare(
      `SELECT COUNT(DISTINCT person_id) AS total FROM app_attendees`,
    ).first();
    return json({ plans, peopleCount: Number(peopleRow?.total || 0) });
  }

  if (url.pathname === "/api/plans" && request.method === "POST") {
    const plan = await request.json();
    if (!validatePlan(plan)) return json({ error: "Faltan datos obligatorios del plan" }, 400);
    const result = await env.DB.prepare(
      `INSERT INTO app_plans
       (title, category, plan_date, plan_time, location, address, capacity,
        price, description, image_url, allow_waitlist, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      plan.title.trim(), plan.category, plan.date, plan.time, plan.location.trim(),
      plan.address.trim(), Number(plan.capacity), plan.price || "", plan.description.trim(),
      plan.image || "/images/hero_xmadrid.jpg", plan.allowWaitlist === false ? 0 : 1,
      String(plan.createdBy || "Administrador").slice(0, 30),
    ).run();
    return json({ id: Number(result.meta.last_row_id) }, 201);
  }

  const planMatch = url.pathname.match(/^\/api\/plans\/(\d+)$/);
  if (planMatch && request.method === "PUT") {
    const plan = await request.json();
    if (!validatePlan(plan)) return json({ error: "Faltan datos obligatorios del plan" }, 400);
    const result = await env.DB.prepare(
      `UPDATE app_plans SET title=?, category=?, plan_date=?, plan_time=?, location=?,
       address=?, capacity=?, price=?, description=?, image_url=?, allow_waitlist=?,
       updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(
      plan.title.trim(), plan.category, plan.date, plan.time, plan.location.trim(),
      plan.address.trim(), Number(plan.capacity), plan.price || "", plan.description.trim(),
      plan.image || "/images/hero_xmadrid.jpg", plan.allowWaitlist === false ? 0 : 1,
      Number(planMatch[1]),
    ).run();
    if (!result.meta.changes) return json({ error: "Plan no encontrado" }, 404);
    return json({ saved: true, id: Number(planMatch[1]) });
  }

  if (planMatch && request.method === "DELETE") {
    const id = Number(planMatch[1]);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM app_comments WHERE plan_id=?").bind(id),
      env.DB.prepare("DELETE FROM app_attendees WHERE plan_id=?").bind(id),
      env.DB.prepare("DELETE FROM app_plans WHERE id=?").bind(id),
    ]);
    return json({ deleted: true });
  }

  const attendanceMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/attendance$/);
  if (attendanceMatch && request.method === "POST") {
    const planId = Number(attendanceMatch[1]);
    const body = await request.json();
    let person;
    try { person = await getPerson(env.DB, body.alias); }
    catch { return json({ error: "Indica un alias válido" }, 400); }
    const plan = await env.DB.prepare("SELECT capacity, allow_waitlist FROM app_plans WHERE id=?").bind(planId).first();
    if (!plan) return json({ error: "Plan no encontrado" }, 404);
    const existing = await env.DB.prepare(
      "SELECT status FROM app_attendees WHERE plan_id=? AND person_id=?",
    ).bind(planId, person.id).first();
    if (existing) {
      await env.DB.prepare("DELETE FROM app_attendees WHERE plan_id=? AND person_id=?").bind(planId, person.id).run();
      if (existing.status === "confirmed") {
        const next = await env.DB.prepare(
          "SELECT person_id FROM app_attendees WHERE plan_id=? AND status='waiting' ORDER BY joined_at LIMIT 1",
        ).bind(planId).first();
        if (next) await env.DB.prepare(
          "UPDATE app_attendees SET status='confirmed' WHERE plan_id=? AND person_id=?",
        ).bind(planId, next.person_id).run();
      }
      return json({ status: "removed" });
    }
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM app_attendees WHERE plan_id=? AND status='confirmed'",
    ).bind(planId).first();
    const status = Number(count.total) < Number(plan.capacity) ? "confirmed" : "waiting";
    if (status === "waiting" && !Number(plan.allow_waitlist)) return json({ error: "El plan está completo" }, 409);
    await env.DB.prepare(
      "INSERT INTO app_attendees(plan_id, person_id, status) VALUES(?, ?, ?)",
    ).bind(planId, person.id, status).run();
    return json({ status, alias: person.alias }, 201);
  }

  if (url.pathname === "/api/people/rename" && request.method === "PUT") {
    const body = await request.json();
    const oldAlias = String(body.oldAlias || "").trim();
    const newAlias = String(body.newAlias || "").trim().slice(0, 30);
    if (!oldAlias || !newAlias) return json({ error: "Los alias no son válidos" }, 400);
    try {
      const result = await env.DB.prepare(
        "UPDATE app_people SET alias=?, updated_at=CURRENT_TIMESTAMP WHERE alias=? COLLATE NOCASE",
      ).bind(newAlias, oldAlias).run();
      return json({ renamed: Boolean(result.meta.changes), alias: newAlias });
    } catch {
      return json({ error: "Ese alias ya está siendo utilizado" }, 409);
    }
  }

  const commentMatch = url.pathname.match(/^\/api\/plans\/(\d+)\/comments$/);
  if (commentMatch && request.method === "POST") {
    const body = await request.json();
    const text = String(body.text || "").trim().slice(0, 220);
    if (!text) return json({ error: "El comentario está vacío" }, 400);
    let person;
    try { person = await getPerson(env.DB, body.alias); }
    catch { return json({ error: "Indica un alias válido" }, 400); }
    await env.DB.prepare(
      "INSERT INTO app_comments(plan_id, person_id, body) VALUES(?, ?, ?)",
    ).bind(Number(commentMatch[1]), person.id, text).run();
    return json({ saved: true }, 201);
  }

  return json({ error: "Ruta API no encontrada" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json({ error: "Recursos web no configurados" }, 503);
    } catch (error) {
      console.error("Worker request failed", error);
      return json({ error: "Error interno", detail: error.message }, 500);
    }
  },
};
