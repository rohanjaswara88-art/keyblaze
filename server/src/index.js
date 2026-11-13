/* Entry point: reads config from the environment and starts the server. */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { attachRaceServer } from './race/server.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION_SWEEP_MS = 60 * 60 * 1000;

const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL; // set in production (Neon); unset locally
const dataDir = process.env.DATA_DIR || resolve(HERE, '../data/pglite');
const siteDir = resolve(HERE, '../..');

if (isProduction && !databaseUrl) {
  console.error('DATABASE_URL is required in production. Set it to your Postgres connection string.');
  process.exit(1);
}

// Races use the same word list as the game, so the server and the browser never drift apart.
const words = createRequire(import.meta.url)(resolve(siteDir, 'js/words.js'));

const db = await openDb(databaseUrl ? { url: databaseUrl } : { dataDir });
const app = createApp({ db, siteDir, secureCookies: isProduction, trustProxy: isProduction });

setInterval(() => {
  db.deleteExpiredSessions().catch((err) => console.error('Session cleanup failed:', err));
}, SESSION_SWEEP_MS).unref();

const server = app.listen(port, () => {
  const store = databaseUrl ? 'Postgres' : `PGlite in ${dataDir}`;
  console.log(`Keyblaze running at http://localhost:${port} (database: ${store})`);
});
const races = attachRaceServer(server, { db, makeWords: (count) => words.generateWords(count) });

async function shutdown() {
  await races.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
