const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'barbershop.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS barbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    color TEXT DEFAULT '#3B82F6',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 30,
    price REAL NOT NULL DEFAULT 0,
    description TEXT,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT,
    loyalty_points INTEGER DEFAULT 0,
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
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (appointment_id) REFERENCES appointments(id)
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
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
    FOREIGN KEY (barber_id) REFERENCES barbers(id)
  );
`);

// Seed initial data if empty
const barberCount = db.prepare('SELECT COUNT(*) as c FROM barbers').get();
if (barberCount.c === 0) {
  const insertBarber = db.prepare('INSERT INTO barbers (name, email, phone, color) VALUES (?, ?, ?, ?)');
  insertBarber.run('Marcus Dubois', 'marcus@barbershop.com', '514-555-0101', '#3B82F6');
  insertBarber.run('Jordan Tremblay', 'jordan@barbershop.com', '514-555-0102', '#10B981');
  insertBarber.run('Alexis Côté', 'alexis@barbershop.com', '514-555-0103', '#F59E0B');

  const insertService = db.prepare('INSERT INTO services (name, duration, price, description) VALUES (?, ?, ?, ?)');
  insertService.run('Coupe classique', 30, 25, 'Coupe de cheveux avec finition');
  insertService.run('Coupe + Barbe', 45, 40, 'Coupe + taille et soin de la barbe');
  insertService.run('Taille de barbe', 20, 20, 'Taille et modelage de la barbe');
  insertService.run('Coupe enfant (-12 ans)', 20, 18, 'Coupe pour enfants de moins de 12 ans');
  insertService.run('Coupe + Soin', 60, 55, 'Coupe avec masque et soins capillaires');
  insertService.run('Rasage traditionnel', 30, 35, 'Rasage au coupe-chou avec serviette chaude');

  const insertHours = db.prepare('INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_closed) VALUES (?, ?, ?, ?, ?)');
  for (let barberId = 1; barberId <= 3; barberId++) {
    for (let day = 0; day <= 6; day++) {
      if (day === 0) {
        insertHours.run(barberId, day, '10:00', '17:00', 0);
      } else if (day === 6) {
        insertHours.run(barberId, day, '09:00', '18:00', 0);
      } else if (day === 1) {
        insertHours.run(barberId, day, '09:00', '18:00', 1);
      } else {
        insertHours.run(barberId, day, '09:00', '18:00', 0);
      }
    }
  }
}

// Seed default site settings
const settingsCount = db.prepare('SELECT COUNT(*) as c FROM site_settings').get();
if (settingsCount.c === 0) {
  const insertSetting = db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)');
  insertSetting.run('hero_image', '');
  insertSetting.run('hero_title', "L'art de la coupe parfaite");
  insertSetting.run('hero_subtitle', 'Prenez rendez-vous en ligne, 24h/24 — Résultats garantis');
  insertSetting.run('hero_tag', 'Salon de coiffure pour hommes');
}

module.exports = db;
