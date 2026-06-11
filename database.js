const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'barbershop.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    sms_used_this_month INTEGER DEFAULT 0,
    sms_reset_date TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS barbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    color TEXT DEFAULT '#3B82F6',
    active INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 30,
    price REAL NOT NULL DEFAULT 0,
    description TEXT,
    active INTEGER DEFAULT 1,
    tenant_id INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    loyalty_points INTEGER DEFAULT 0,
    tenant_id INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    barber_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    reminder_sent INTEGER DEFAULT 0,
    tenant_id INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (barber_id) REFERENCES barbers(id),
    FOREIGN KEY (service_id) REFERENCES services(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    appointment_id INTEGER,
    tenant_id INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    appointment_id INTEGER,
    message TEXT NOT NULL,
    channel TEXT DEFAULT 'sms',
    status TEXT DEFAULT 'pending',
    scheduled_at TEXT NOT NULL,
    sent_at TEXT,
    tenant_id INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  );

  CREATE TABLE IF NOT EXISTS working_hours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barber_id INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    is_closed INTEGER DEFAULT 0,
    tenant_id INTEGER DEFAULT 1,
    FOREIGN KEY (barber_id) REFERENCES barbers(id)
  );
`);

// Migration: ajouter tenant_id aux tables existantes si pas encore fait
const cols = db.prepare("PRAGMA table_info(barbers)").all().map(c => c.name);
if (!cols.includes('tenant_id')) {
  ['barbers','services','clients','appointments','transactions','reminders','working_hours']
    .forEach(t => {
      try { db.exec(`ALTER TABLE ${t} ADD COLUMN tenant_id INTEGER DEFAULT 1`); } catch(e) {}
    });
}

// Seed tenant Fenix Barbier (id=1) si pas de tenants
const tenantCount = db.prepare('SELECT COUNT(*) as c FROM tenants').get();
if (tenantCount.c === 0) {
  const bcrypt = require('bcryptjs');
  const pwd = process.env.ADMIN_PASSWORD || 'Fenix2024!';
  const hash = bcrypt.hashSync(pwd, 10);
  const trialEnd = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);

  db.prepare(`INSERT INTO tenants (id, slug, name, email, phone, address, plan, plan_status, trial_ends_at)
    VALUES (1, 'fenix-barbier', 'Fenix Barbier', ?, ?, ?, 'pro', 'active', ?)`)
    .run(
      process.env.EMAIL_USER || 'admin@fenixbarbier.ca',
      process.env.SHOP_PHONE || '418-555-0100',
      process.env.SHOP_ADDRESS || '155 Rue Des Chênes O, Quebec Qc G1L 1K6',
      trialEnd
    );

  db.prepare(`INSERT INTO users (tenant_id, email, password_hash, name, role)
    VALUES (1, ?, ?, 'Administrateur', 'owner')`)
    .run(process.env.EMAIL_USER || 'admin@fenixbarbier.ca', hash);

  // Seed barbiers, services, horaires avec tenant_id=1
  const insertBarber = db.prepare('INSERT INTO barbers (name, email, phone, color, tenant_id) VALUES (?, ?, ?, ?, 1)');
  insertBarber.run('Marcus Dubois', 'marcus@fenixbarbier.ca', '418-555-0101', '#3B82F6');
  insertBarber.run('Jordan Tremblay', 'jordan@fenixbarbier.ca', '418-555-0102', '#10B981');
  insertBarber.run('Alexis Côté', 'alexis@fenixbarbier.ca', '418-555-0103', '#F59E0B');

  const insertService = db.prepare('INSERT INTO services (name, duration, price, description, tenant_id) VALUES (?, ?, ?, ?, 1)');
  insertService.run('Coupe classique', 30, 25, 'Coupe de cheveux avec finition');
  insertService.run('Coupe + Barbe', 45, 40, 'Coupe + taille et soin de la barbe');
  insertService.run('Taille de barbe', 20, 20, 'Taille et modelage de la barbe');
  insertService.run('Coupe enfant (-12 ans)', 20, 18, 'Coupe pour enfants de moins de 12 ans');
  insertService.run('Coupe + Soin', 60, 55, 'Coupe avec masque et soins capillaires');
  insertService.run('Rasage traditionnel', 30, 35, 'Rasage au coupe-chou avec serviette chaude');

  const insertHours = db.prepare('INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_closed, tenant_id) VALUES (?, ?, ?, ?, ?, 1)');
  for (let barberId = 1; barberId <= 3; barberId++) {
    for (let day = 0; day <= 6; day++) {
      if (day === 0) insertHours.run(barberId, day, '10:00', '17:00', 0);
      else if (day === 1) insertHours.run(barberId, day, '09:00', '18:00', 1);
      else if (day === 6) insertHours.run(barberId, day, '09:00', '18:00', 0);
      else insertHours.run(barberId, day, '09:00', '18:00', 0);
    }
  }
  // S'assurer que toutes les données existantes ont tenant_id=1
  ['barbers','services','clients','appointments','transactions','reminders','working_hours']
    .forEach(t => db.exec(`UPDATE ${t} SET tenant_id=1 WHERE tenant_id IS NULL`));
} else {
  // Si tenants existent mais données existantes n'ont pas de tenant_id
  ['barbers','services','clients','appointments','transactions','reminders','working_hours']
    .forEach(t => {
      try { db.exec(`UPDATE ${t} SET tenant_id=1 WHERE tenant_id IS NULL`); } catch(e) {}
    });
}

// Migration: seed horaires par défaut pour les barbiers sans horaires
{
  const barbersWithNoHours = db.prepare(`
    SELECT b.id, b.tenant_id FROM barbers b
    WHERE b.active = 1
      AND NOT EXISTS (SELECT 1 FROM working_hours wh WHERE wh.barber_id = b.id)
  `).all();
  const insH = db.prepare('INSERT OR IGNORE INTO working_hours (barber_id, day_of_week, start_time, end_time, is_closed, tenant_id) VALUES (?, ?, ?, ?, ?, ?)');
  const defaultSchedule = [[0,'10:00','17:00',0],[1,'09:00','18:00',0],[2,'09:00','18:00',0],[3,'09:00','18:00',0],[4,'09:00','18:00',0],[5,'09:00','18:00',0],[6,'10:00','17:00',0]];
  const tx = db.transaction(() => {
    barbersWithNoHours.forEach(b => defaultSchedule.forEach(([d,s,e,c]) => insH.run(b.id, d, s, e, c, b.tenant_id)));
  });
  tx();
}

module.exports = db;
