/* Data access (the repository). Everything the app stores goes through here, so the rest of the server
   never sees SQL.

   It always speaks Postgres:
   - production: a real Postgres server (Neon), reached through DATABASE_URL with the `pg` driver;
   - local development and tests: PGlite, which is Postgres compiled to WebAssembly and runs inside Node,
     either in memory or saved to a folder. Same SQL, nothing to install. */
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync } from 'node:fs';

const UNIQUE_VIOLATION = '23505';
const DEFAULT_POOL_SIZE = 5; // Neon's free tier allows plenty more; five is ample for one server

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      TEXT   NOT NULL,
    password_hash TEXT   NOT NULL,
    created_at    BIGINT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT   PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

  CREATE TABLE IF NOT EXISTS results (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wpm         DOUBLE PRECISION NOT NULL,
    raw         DOUBLE PRECISION NOT NULL,
    accuracy    DOUBLE PRECISION NOT NULL,
    consistency DOUBLE PRECISION NOT NULL,
    mode        TEXT             NOT NULL,
    amount      INTEGER          NOT NULL,
    created_at  BIGINT           NOT NULL
  );
  CREATE INDEX IF NOT EXISTS results_user_time ON results (user_id, created_at);
  CREATE INDEX IF NOT EXISTS results_board ON results (mode, amount, created_at);
`;

/* Each player's single best run for one test type since a time, ranked. The window function keeps the
   accuracy and date of that best run, not just the top speed. */
const LEADERBOARD_SQL = `
  SELECT username, wpm, accuracy, created_at FROM (
    SELECT u.username, r.wpm, r.accuracy, r.created_at,
           ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.wpm DESC, r.created_at ASC) AS rn
    FROM results r JOIN users u ON u.id = r.user_id
    WHERE r.mode = $1 AND r.amount = $2 AND r.created_at >= $3
  ) best
  WHERE rn = 1
  ORDER BY wpm DESC, created_at ASC
  LIMIT $4`;

/* ---------- drivers: both expose query(sql, params) -> rows, exec(sql) and close() ---------- */

function postgresDriver(url, poolSize) {
  const pool = new pg.Pool({ connectionString: url, max: poolSize });
  return {
    query: async (sql, params) => (await pool.query(sql, params)).rows,
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
  };
}

async function pgliteDriver(dataDir) {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = new PGlite(dataDir); // no folder: in memory
  await db.waitReady;
  return {
    query: async (sql, params) => (await db.query(sql, params)).rows,
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  };
}

/* ---------- mapping rows to plain objects ---------- */

// The pg driver returns BIGINT and averages as strings (they can exceed JS numbers); ours never do.
const num = (v) => (v === null || v === undefined ? v : Number(v));

function toUser(row) {
  return row ? { id: num(row.id), username: row.username, createdAt: num(row.created_at) } : null;
}

function toResult(row) {
  return {
    id: num(row.id), wpm: num(row.wpm), raw: num(row.raw), acc: num(row.accuracy), cons: num(row.consistency),
    mode: row.mode, amount: num(row.amount), ts: num(row.created_at),
  };
}

function repository(driver) {
  const one = async (sql, params) => (await driver.query(sql, params))[0];

  return {
    /** Returns the new user, or null when the username is taken (in any letter case). */
    async createUser(username, passwordHash, now = Date.now()) {
      try {
        const row = await one(
          'INSERT INTO users (username, password_hash, created_at) VALUES ($1, $2, $3) RETURNING *',
          [username, passwordHash, now],
        );
        return toUser(row);
      } catch (err) {
        if (err.code === UNIQUE_VIOLATION) return null;
        throw err;
      }
    },
    /** Includes the password hash; only the login route should call this. */
    async findUserWithHash(username) {
      const row = await one('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
      return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
    },
    async createSession(tokenHash, userId, expiresAt) {
      await driver.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, userId, expiresAt]);
    },
    async userForSession(tokenHash, now = Date.now()) {
      return toUser(await one(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, now],
      ));
    },
    async deleteSession(tokenHash) {
      await driver.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },
    async deleteExpiredSessions(now = Date.now()) {
      await driver.query('DELETE FROM sessions WHERE expires_at <= $1', [now]);
    },
    async addResult(userId, r, now = Date.now()) {
      const row = await one(
        `INSERT INTO results (user_id, wpm, raw, accuracy, consistency, mode, amount, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [userId, r.wpm, r.raw, r.acc, r.cons, r.mode, r.amount, now],
      );
      return { id: num(row.id), ...r, ts: now };
    },
    /** Newest first. */
    async listResults(userId, limit) {
      const rows = await driver.query(
        'SELECT * FROM results WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2',
        [userId, limit],
      );
      return rows.map(toResult);
    },
    async summary(userId) {
      const row = await one(
        `SELECT COUNT(*) AS tests, COALESCE(MAX(wpm), 0) AS best, COALESCE(AVG(accuracy), 0) AS acc
         FROM results WHERE user_id = $1`,
        [userId],
      );
      return { tests: num(row.tests), best: num(row.best), acc: num(row.acc) };
    },
    /** Best run per player for one test type, fastest first. */
    async leaderboard({ mode, amount, since, limit }) {
      const rows = await driver.query(LEADERBOARD_SQL, [mode, amount, since, limit]);
      return rows.map((row, i) => ({
        rank: i + 1, username: row.username, wpm: num(row.wpm), acc: num(row.accuracy), ts: num(row.created_at),
      }));
    },
    close: () => driver.close(),
  };
}

/**
 * Opens the database and creates the tables if they are missing.
 * @param {{url?: string, dataDir?: string, poolSize?: number}} [options]
 *   url: a postgres:// connection string (production). Otherwise PGlite is used, saved in dataDir,
 *   or kept in memory when dataDir is omitted (tests).
 */
export async function openDb({ url, dataDir, poolSize = DEFAULT_POOL_SIZE } = {}) {
  const driver = url ? postgresDriver(url, poolSize) : await pgliteDriver(dataDir);
  await driver.exec(SCHEMA);
  return repository(driver);
}
