import 'dotenv/config';

const DEFAULTS = {
  PORT: 4000,
  DATABASE_URL: 'postgres://cloudworx:cloudworx@localhost:55432/ledger',
  NODE_ENV: 'development',
};

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${value}": must be an integer between 1 and 65535`);
  }
  return port;
}

function parseDatabaseUrl(value, isTest) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid DATABASE_URL: must be a valid connection string');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Invalid DATABASE_URL: protocol must be postgres:// or postgresql://');
  }
  let database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('Invalid DATABASE_URL: database name is missing');
  }
  // Tests truncate tables, so they get their own database (e.g. ledger_test)
  // and never touch development data.
  if (isTest) {
    database = `${database}_test`;
    url.pathname = `/${database}`;
  }
  return { url: url.toString(), database };
}

const env = process.env;
const nodeEnv = env.NODE_ENV || DEFAULTS.NODE_ENV;
const db = parseDatabaseUrl(env.DATABASE_URL || DEFAULTS.DATABASE_URL, nodeEnv === 'test');

const config = Object.freeze({
  env: nodeEnv,
  port: parsePort(env.PORT || DEFAULTS.PORT),
  db: Object.freeze({
    url: db.url,
    // Database name, used on startup to create it if it doesn't exist.
    name: db.database,
  }),
  pagination: Object.freeze({
    defaultPage: 1,
    defaultLimit: 10,
    maxLimit: 100,
  }),
});

export default config;
