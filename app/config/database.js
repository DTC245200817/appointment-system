const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'appointment_db',
  user: process.env.DB_USER || 'appointment_user',
  password: process.env.DB_PASSWORD || 'SecureAppPass_2026!',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB Error] Unexpected error on idle PostgreSQL client:', err.message);
});

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  return { res, duration };
}

async function testConnection(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      const res = await client.query('SELECT NOW() as current_time, current_user, current_database()');
      client.release();
      return { success: true, info: res.rows[0] };
    } catch (err) {
      if (i < retries - 1) {
        console.warn(`[DB Connect] PostgreSQL not ready yet (${err.message}), retrying in ${delay / 1000}s... (${i + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

module.exports = {
  pool,
  query,
  testConnection,
};
