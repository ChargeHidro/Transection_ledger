import pg from 'pg';
import config from '../config/index.js';

const { Pool, types } = pg;

// pg returns NUMERIC columns as strings to avoid precision loss. Amounts are
// NUMERIC(18,2) and validated well below Number.MAX_SAFE_INTEGER, so parsing
// them to numbers is safe and keeps API responses numeric.
const NUMERIC_OID = 1700;
types.setTypeParser(NUMERIC_OID, (value) => parseFloat(value));

const pool = new Pool({ connectionString: config.db.url });

// An idle client can error if the server drops the connection; without a
// listener this would crash the process.
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

export const query = (text, params) => pool.query(text, params);

/**
 * Runs `work` inside a single database transaction. Commits if it resolves,
 * rolls back if it throws, and always releases the client.
 */
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const closePool = () => pool.end();

export default pool;
