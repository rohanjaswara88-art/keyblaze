/* These run the real SQL on Postgres (PGlite, in memory), the same SQL production runs on Neon. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { validateBoardQuery } from '../src/validate.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 14);
const run = (wpm) => ({ wpm, raw: wpm, acc: 97, cons: 80, mode: 'time', amount: 30 });

async function withDb(fn) {
  const db = await openDb();
  try {
    await fn(db);
  } finally {
    await db.close();
  }
}

test('leaderboard periods only count runs inside the window', () => withDb(async (db) => {
  const old = await db.createUser('old_timer', 'x:y');
  const fresh = await db.createUser('fresh', 'x:y');
  await db.addResult(old.id, run(120), NOW - 30 * DAY);
  await db.addResult(old.id, run(60), NOW - 2 * DAY);
  await db.addResult(fresh.id, run(80), NOW - 1000);

  const board = async (period) => {
    const { value } = validateBoardQuery({ mode: 'time', amount: '30', period }, NOW);
    return (await db.leaderboard({ ...value, limit: 10 })).map((r) => `${r.username}:${r.wpm}`);
  };
  assert.deepEqual(await board('all'), ['old_timer:120', 'fresh:80']);
  assert.deepEqual(await board('week'), ['fresh:80', 'old_timer:60']);
  assert.deepEqual(await board('day'), ['fresh:80']);
}));

test('ties go to whoever set the speed first', () => withDb(async (db) => {
  const a = await db.createUser('second', 'x:y');
  const b = await db.createUser('first', 'x:y');
  await db.addResult(a.id, run(90), NOW - 100);
  await db.addResult(b.id, run(90), NOW - 200);
  const rows = await db.leaderboard({ mode: 'time', amount: 30, since: 0, limit: 10 });
  assert.deepEqual(rows.map((r) => r.username), ['first', 'second']);
}));

test('usernames are unique regardless of letter case', () => withDb(async (db) => {
  assert.ok(await db.createUser('Alice', 'x:y'));
  assert.equal(await db.createUser('alice', 'x:y'), null);
  const found = await db.findUserWithHash('ALICE');
  assert.equal(found.username, 'Alice');
}));

test('numbers come back as numbers, not strings', () => withDb(async (db) => {
  const u = await db.createUser('typist', 'x:y');
  await db.addResult(u.id, run(70), NOW);
  const [r] = await db.listResults(u.id, 5);
  for (const key of ['id', 'wpm', 'acc', 'amount', 'ts']) assert.equal(typeof r[key], 'number', key);
  const s = await db.summary(u.id);
  assert.deepEqual(s, { tests: 1, best: 70, acc: 97 });
}));

test('expired sessions are not accepted and get cleaned up', () => withDb(async (db) => {
  const u = await db.createUser('sleepy', 'x:y');
  await db.createSession('live', u.id, NOW + DAY);
  await db.createSession('stale', u.id, NOW - 1);
  assert.equal((await db.userForSession('live', NOW)).username, 'sleepy');
  assert.equal(await db.userForSession('stale', NOW), null);
  await db.deleteExpiredSessions(NOW);
  await db.createSession('stale', u.id, NOW + DAY); // the primary key is free again only if it was deleted
}));
