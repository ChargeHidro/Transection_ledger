import app from './app.js';
import config from './config/index.js';
import { setupDatabase } from './db/migrate.js';
import { closePool } from './db/pool.js';

function describeStartupError(err) {
  // On some platforms a refused connection surfaces as an AggregateError.
  const code = err.code ?? err.errors?.[0]?.code;
  if (code === 'ECONNREFUSED') {
    const { hostname, port } = new URL(config.db.url);
    return `Cannot reach PostgreSQL at ${hostname}:${port}. Is the database container running?`;
  }
  if (code === '28P01') return 'PostgreSQL rejected the username or password in DATABASE_URL.';
  return err.message;
}

async function start() {
  try {
    await setupDatabase();
  } catch (err) {
    console.error(`Failed to prepare the database: ${describeStartupError(err)}`);
    await closePool().catch(() => {});
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`Transaction Ledger API listening on http://localhost:${config.port}/api`);
    console.log(`Documentation available at http://localhost:${config.port}/documentation`);
  });

  server.on('error', async (err) => {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Set PORT to a free port.`
        : err.message,
    );
    await closePool().catch(() => {});
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
