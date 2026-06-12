require('dotenv').config();
const { Pool } = require('pg');

// Parse BIGINT (COUNT results) as JS integers instead of strings
const pg = require('pg');
pg.types.setTypeParser(20, parseInt);
pg.types.setTypeParser(1700, parseFloat);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

function toPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function makeStmt(client, rawSql) {
  const pgSql = toPostgres(rawSql);
  const needsReturning = /^\s*INSERT\b/i.test(pgSql) && !/\bRETURNING\b/i.test(pgSql);
  const execSql = needsReturning ? pgSql + ' RETURNING id' : pgSql;

  return {
    all: async (...args) => {
      const params = args.flat();
      const result = await client.query(pgSql, params.length ? params : undefined);
      return result.rows;
    },
    get: async (...args) => {
      const params = args.flat();
      const result = await client.query(pgSql, params.length ? params : undefined);
      return result.rows[0] ?? null;
    },
    run: async (...args) => {
      const params = args.flat();
      const result = await client.query(execSql, params.length ? params : undefined);
      return {
        lastInsertRowid: result.rows[0]?.id ?? null,
        changes: result.rowCount
      };
    }
  };
}

module.exports = {
  prepare: (sql) => makeStmt(pool, sql),
  pool,
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await fn({ prepare: (sql) => makeStmt(client, sql) });
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};
