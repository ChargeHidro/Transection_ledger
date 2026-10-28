import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import config from '../config/index.js';
import pool from './pool.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

// Arbitrary constant key for pg_advisory_lock, so two app instances starting
// at the same time can't apply the same migration twice.
const MIGRATION_LOCK_KEY = 72_517_001;

/**
 * Creates the target database if it doesn't exist. Connects to the server's
 * default `postgres` maintenance database to do so.
 */
export async function ensureDatabase() {
  const adminUrl = new URL(config.db.url);
  adminUrl.pathname = '/postgres';

  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      config.db.name,
    ]);
    if (rowCount === 0) {
      // Identifiers can't be parameterised; escapeIdentifier quotes it safely.
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(config.db.name)}`);
      console.log(`Created database "${config.db.name}"`);
    }
  } catch (err) {
    // Another instance may have created it between the check and the CREATE.
    if (err.code !== '42P04') throw err;
  } finally {
    await client.end();
  }
}

/**
 * Applies every `.sql` file in migrations/ that hasn't run yet, in filename
 * order. Each file runs in its own transaction together with its bookkeeping
 * row, so a failed migration leaves no partial changes behind.
 */
export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));

    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/** Startup step: make sure the database exists and its schema is current. */
export async function setupDatabase() {
  await ensureDatabase();
  await runMigrations();
}

// Allow running directly: `npm run migrate`
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await setupDatabase();
    console.log('Database is up to date');
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
