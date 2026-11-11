PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_plans (
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
);

CREATE TABLE IF NOT EXISTS app_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alias TEXT NOT NULL COLLATE NOCASE UNIQUE,
  zone TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_attendees (
  plan_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'waiting')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_id, person_id),
  FOREIGN KEY (plan_id) REFERENCES app_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES app_people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES app_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (person_id) REFERENCES app_people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_plans_date ON app_plans(plan_date, plan_time);
CREATE INDEX IF NOT EXISTS idx_app_attendees_plan ON app_attendees(plan_id, status, joined_at);
CREATE INDEX IF NOT EXISTS idx_app_comments_plan ON app_comments(plan_id, created_at);
