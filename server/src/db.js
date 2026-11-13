/* Data access. Everything the app stores goes through this module, so swapping SQLite for
   Postgres later only means rewriting this file. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS results (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wpm         REAL    NOT NULL,
    raw         REAL    NOT NULL,
    accuracy    REAL    NOT NULL,
    consistency REAL    NOT NULL,
    mode        TEXT    NOT NULL,
    amount      INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS results_user_time ON results(user_id, created_at);
  CREATE INDEX IF NOT EXISTS results_board ON results(mode, amount, created_at);
`;

/* Each player's single best run for one test type since a time, ranked. The window function keeps the
   accuracy and date of that best run, not just the top speed. */
const LEADERBOARD_SQL = `
  SELECT username, wpm, accuracy, created_at FROM (
    SELECT u.username, r.wpm, r.accuracy, r.created_at,
           ROW_NUMBER() OVER (PARTITION BY r.user_id ORDER BY r.wpm DESC, r.created_at ASC) AS rn
    FROM results r JOIN users u ON u.id = r.user_id
    WHERE r.mode = ? AND r.amount = ? AND r.created_at >= ?
  )
  WHERE rn = 1
  ORDER BY wpm DESC, created_at ASC
  LIMIT ?`;

function toUser(row) {
  return row ? { id: row.id, username: row.username, createdAt: row.created_at } : null;
}

function toResult(row) {
  return {
    id: row.id, wpm: row.wpm, raw: row.raw, acc: row.accuracy, cons: row.consistency,
    mode: row.mode, amount: row.amount, ts: row.created_at,
  };
}

/** Opens (and creates if needed) the database. Pass ':memory:' for tests. */
export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);

  const q = {
    insertUser: db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    userBySession: db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                               WHERE s.token_hash = ? AND s.expires_at > ?`),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    insertResult: db.prepare(`INSERT INTO results (user_id, wpm, raw, accuracy, consistency, mode, amount, created_at)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
    resultsByUser: db.prepare('SELECT * FROM results WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'),
    summary: db.prepare(`SELECT COUNT(*) AS tests, COALESCE(MAX(wpm), 0) AS best, COALESCE(AVG(accuracy), 0) AS acc
                         FROM results WHERE user_id = ?`),
    leaderboard: db.prepare(LEADERBOARD_SQL),
  };

  return {
    /** Returns the new user, or null when the username is taken. */
    createUser(username, passwordHash, now = Date.now()) {
      try {
        const { lastInsertRowid } = q.insertUser.run(username, passwordHash, now);
        return { id: Number(lastInsertRowid), username, createdAt: now };
      } catch (err) {
        if (String(err.message).includes('UNIQUE')) return null;
        throw err;
      }
    },
    /** Includes the password hash; only the auth code should call this. */
    findUserWithHash(username) {
      const row = q.userByName.get(username);
      return row ? { ...toUser(row), passwordHash: row.password_hash } : null;
    },
    createSession(tokenHash, userId, expiresAt) {
      q.insertSession.run(tokenHash, userId, expiresAt);
    },
    userForSession(tokenHash, now = Date.now()) {
      return toUser(q.userBySession.get(tokenHash, now));
    },
    deleteSession(tokenHash) {
      q.deleteSession.run(tokenHash);
    },
    deleteExpiredSessions(now = Date.now()) {
      q.deleteExpired.run(now);
    },
    addResult(userId, r, now = Date.now()) {
      const { lastInsertRowid } = q.insertResult.run(userId, r.wpm, r.raw, r.acc, r.cons, r.mode, r.amount, now);
      return { id: Number(lastInsertRowid), ...r, ts: now };
    },
    /** Newest first. */
    listResults(userId, limit) {
      return q.resultsByUser.all(userId, limit).map(toResult);
    },
    summary(userId) {
      const row = q.summary.get(userId);
      return { tests: row.tests, best: row.best, acc: row.acc };
    },
    /** Best run per player for one test type, fastest first. */
    leaderboard({ mode, amount, since, limit }) {
      return q.leaderboard.all(mode, amount, since, limit).map((row, i) => ({
        rank: i + 1, username: row.username, wpm: row.wpm, acc: row.accuracy, ts: row.created_at,
      }));
    },
    close() {
      db.close();
    },
  };
}
