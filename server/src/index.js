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
const dbPath = process.env.DATABASE_PATH || resolve(HERE, '../data/keyblaze.db');
const siteDir = resolve(HERE, '../..');

// Races use the same word list as the game, so the server and the browser never drift apart.
const words = createRequire(import.meta.url)(resolve(siteDir, 'js/words.js'));

const db = openDb(dbPath);
const app = createApp({ db, siteDir, secureCookies: isProduction, trustProxy: isProduction });

setInterval(() => db.deleteExpiredSessions(), SESSION_SWEEP_MS).unref();

const server = app.listen(port, () => {
  console.log(`Keyblaze running at http://localhost:${port}`);
});
const races = attachRaceServer(server, { db, makeWords: (count) => words.generateWords(count) });

function shutdown() {
  races.close().then(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
