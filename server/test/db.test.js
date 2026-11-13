import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { validateBoardQuery } from '../src/validate.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 14);
const run = (wpm) => ({ wpm, raw: wpm, acc: 97, cons: 80, mode: 'time', amount: 30 });

test('leaderboard periods only count runs inside the window', () => {
  const db = openDb(':memory:');
  try {
    const old = db.createUser('old_timer', 'x:y');
    const fresh = db.createUser('fresh', 'x:y');
    db.addResult(old.id, run(120), NOW - 30 * DAY);
    db.addResult(old.id, run(60), NOW - 2 * DAY);
    db.addResult(fresh.id, run(80), NOW - 1000);

    const board = (period) => {
      const { value } = validateBoardQuery({ mode: 'time', amount: '30', period }, NOW);
      return db.leaderboard({ ...value, limit: 10 }).map((r) => `${r.username}:${r.wpm}`);
    };
    assert.deepEqual(board('all'), ['old_timer:120', 'fresh:80']);
    assert.deepEqual(board('week'), ['fresh:80', 'old_timer:60']);
    assert.deepEqual(board('day'), ['fresh:80']);
  } finally {
    db.close();
  }
});

test('ties go to whoever set the speed first', () => {
  const db = openDb(':memory:');
  try {
    const a = db.createUser('second', 'x:y');
    const b = db.createUser('first', 'x:y');
    db.addResult(a.id, run(90), NOW - 100);
    db.addResult(b.id, run(90), NOW - 200);
    const rows = db.leaderboard({ mode: 'time', amount: 30, since: 0, limit: 10 });
    assert.deepEqual(rows.map((r) => r.username), ['first', 'second']);
  } finally {
    db.close();
  }
});
