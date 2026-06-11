/**
 * Migrate data from SQLite (barbershop.db) → PostgreSQL (Supabase)
 *
 * Usage:
 *   1. Make sure DATABASE_URL is set in your .env
 *   2. Make sure schema.sql has been run in PostgreSQL first
 *   3. node migrate-sqlite-to-pg.js
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const SQLITE_PATH = path.join(__dirname, 'barbershop.db');
if (!fs.existsSync(SQLITE_PATH)) {
  console.error('barbershop.db not found — nothing to migrate.');
  process.exit(0);
}

let sqlite;
try {
  const Database = require('better-sqlite3');
  sqlite = new Database(SQLITE_PATH, { readonly: true });
} catch (e) {
  console.error('better-sqlite3 not available:', e.message);
  process.exit(1);
}

const pg = require('pg');
pg.types.setTypeParser(20, parseInt);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Tables in FK-safe insertion order
const TABLES = [
  'tenants',
  'users',
  'refresh_tokens',
  'barbers',
  'services',
  'clients',
  'appointments',
  'transactions',
  'reminders',
  'working_hours',
  'gallery',
  'site_settings',
  'products'
];

function getColumns(db, table) {
  try {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return info.map(c => c.name);
  } catch (_) {
    return null;
  }
}

async function tableExists(client, table) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [table]
  );
  return r.rowCount > 0;
}

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Connected to PostgreSQL.');

    for (const table of TABLES) {
      const cols = getColumns(sqlite, table);
      if (!cols) {
        console.log(`  [SKIP] ${table} — not in SQLite`);
        continue;
      }
      if (!(await tableExists(client, table))) {
        console.log(`  [SKIP] ${table} — not in PostgreSQL (run schema.sql first)`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      if (!rows.length) {
        console.log(`  [OK]   ${table} — 0 rows`);
        continue;
      }

      // Clear existing data in correct order (FKs)
      await client.query(`DELETE FROM ${table}`);

      let inserted = 0;
      for (const row of rows) {
        // Filter to only columns that exist in the SQLite table
        const keys = cols.filter(c => c in row);
        const vals = keys.map(k => {
          const v = row[k];
          // Convert SQLite integer booleans to SMALLINT (keep as-is)
          return v === undefined ? null : v;
        });
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
        try {
          await client.query(sql, vals);
          inserted++;
        } catch (err) {
          console.warn(`  [WARN] ${table} row id=${row.id}: ${err.message}`);
        }
      }
      console.log(`  [OK]   ${table} — ${inserted}/${rows.length} rows`);

      // Reset PostgreSQL sequence to max(id) + 1
      await client.query(
        `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1)) FROM ${table}`,
        [table]
      );
    }

    console.log('\nMigration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

migrate();
