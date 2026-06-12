-- PostgreSQL schema for Créno – run once in Supabase SQL editor
-- or: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  plan TEXT DEFAULT 'starter',
  plan_status TEXT DEFAULT 'trialing',
  trial_ends_at TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  current_period_end TEXT,
  logo_url TEXT,
  banner_url TEXT,
  hero_photo_url TEXT,
  primary_color TEXT DEFAULT '#e2b04a',
  hero_title TEXT DEFAULT 'L''art de la coupe parfaite',
  hero_subtitle TEXT DEFAULT 'Prenez rendez-vous en ligne, 24h/24 — Résultats garantis',
  hero_tag TEXT DEFAULT 'Salon de coiffure pour hommes',
  instagram_url TEXT,
  facebook_url TEXT,
  tiktok_url TEXT,
  about_text TEXT,
  products_text TEXT,
  sms_used_this_month INTEGER DEFAULT 0,
  sms_reset_date TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  active SMALLINT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS barbers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  color TEXT DEFAULT '#3B82F6',
  active SMALLINT DEFAULT 1,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  duration INTEGER NOT NULL DEFAULT 30,
  price REAL NOT NULL DEFAULT 0,
  description TEXT,
  icon TEXT DEFAULT 'fas fa-cut',
  active SMALLINT DEFAULT 1,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  notes TEXT,
  loyalty_points INTEGER DEFAULT 0,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  barber_id INTEGER NOT NULL REFERENCES barbers(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  reminder_sent SMALLINT DEFAULT 0,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  appointment_id INTEGER REFERENCES appointments(id),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  message TEXT NOT NULL,
  channel TEXT DEFAULT 'sms',
  status TEXT DEFAULT 'pending',
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS working_hours (
  id SERIAL PRIMARY KEY,
  barber_id INTEGER NOT NULL REFERENCES barbers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_closed SMALLINT DEFAULT 0,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  UNIQUE (barber_id, day_of_week)
);

CREATE TABLE IF NOT EXISTS gallery (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hero_slides (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  type TEXT,
  price REAL DEFAULT 0,
  photo_url TEXT,
  description TEXT,
  active SMALLINT DEFAULT 1,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date ON appointments(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_barber_date ON appointments(barber_id, date);
CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_working_hours_barber ON working_hours(barber_id, day_of_week);
