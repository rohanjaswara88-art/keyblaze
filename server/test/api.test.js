import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

/** Starts the app on a free port with a fresh in-memory database. */
async function startServer(rateLimits = { auth: 1000, results: 1000 }) {
  const db = await openDb();
  const app = createApp({ db, rateLimits });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    },
  };
}

/** A tiny client that keeps the session cookie between calls, like a browser. */
function client(base) {
  let cookie = '';
  return async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, body: await res.json(), setCookie };
  };
}

const RESULT = { wpm: 72.4, raw: 78, acc: 96.5, cons: 81, mode: 'time', amount: 30 };

describe('Keyblaze API', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv.stop(); });

  test('health check answers', async () => {
    const res = await client(srv.base)('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, data: { status: 'up' } });
  });

  test('register signs the user in with an httpOnly cookie', async () => {
    const call = client(srv.base);
    const res = await call('POST', '/api/auth/register', { username: 'alice', password: 'correct-horse' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.user.username, 'alice');
    assert.equal(res.body.data.user.passwordHash, undefined);
    assert.match(res.setCookie, /HttpOnly/i);
    assert.match(res.setCookie, /SameSite=Lax/i);
    const me = await call('GET', '/api/me');
    assert.equal(me.body.data.user.username, 'alice');
  });

  test('register rejects a taken username, ignoring case', async () => {
    const call = client(srv.base);
    await call('POST', '/api/auth/register', { username: 'bob_1', password: 'password123' });
    const res = await call('POST', '/api/auth/register', { username: 'BOB_1', password: 'password456' });
    assert.equal(res.status, 409);
    assert.equal(res.body.ok, false);
  });

  test('register validates username and password', async () => {
    const call = client(srv.base);
    assert.equal((await call('POST', '/api/auth/register', { username: 'a', password: 'password123' })).status, 400);
    assert.equal((await call('POST', '/api/auth/register', { username: 'has space', password: 'password123' })).status, 400);
    assert.equal((await call('POST', '/api/auth/register', { username: 'carol', password: 'short' })).status, 400);
    assert.equal((await call('POST', '/api/auth/register', {})).status, 400);
  });

  test('login works with the right password and fails the same way otherwise', async () => {
    await client(srv.base)('POST', '/api/auth/register', { username: 'dave', password: 'dave-password' });
    const call = client(srv.base);
    const wrong = await call('POST', '/api/auth/login', { username: 'dave', password: 'not-his-password' });
    const missing = await call('POST', '/api/auth/login', { username: 'nobody_here', password: 'whatever123' });
    assert.equal(wrong.status, 401);
    assert.deepEqual(wrong.body, missing.body);
    const good = await call('POST', '/api/auth/login', { username: 'DAVE', password: 'dave-password' });
    assert.equal(good.status, 200);
    assert.equal(good.body.data.user.username, 'dave');
  });

  test('logout ends the session', async () => {
    const call = client(srv.base);
    await call('POST', '/api/auth/register', { username: 'erin', password: 'erin-password' });
    await call('POST', '/api/auth/logout', {});
    const me = await call('GET', '/api/me');
    assert.equal(me.body.data.user, null);
  });

  test('results need a signed-in user', async () => {
    const call = client(srv.base);
    assert.equal((await call('POST', '/api/results', RESULT)).status, 401);
    assert.equal((await call('GET', '/api/results')).status, 401);
  });

  test('saved results come back newest first with a summary', async () => {
    const call = client(srv.base);
    await call('POST', '/api/auth/register', { username: 'frank', password: 'frank-password' });
    const first = await call('POST', '/api/results', RESULT);
    assert.equal(first.status, 201);
    await call('POST', '/api/results', { ...RESULT, wpm: 90, raw: 92, acc: 98.5 });
    const res = await call('GET', '/api/results');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.results.map((r) => r.wpm), [90, 72.4]);
    assert.equal(res.body.data.summary.tests, 2);
    assert.equal(res.body.data.summary.best, 90);
    assert.equal(res.body.data.summary.acc, 97.5);
  });

  test('users only see their own results', async () => {
    const a = client(srv.base);
    const b = client(srv.base);
    await a('POST', '/api/auth/register', { username: 'gina', password: 'gina-password' });
    await b('POST', '/api/auth/register', { username: 'hank', password: 'hank-password' });
    await a('POST', '/api/results', RESULT);
    const res = await b('GET', '/api/results');
    assert.equal(res.body.data.results.length, 0);
  });

  test('impossible results are rejected', async () => {
    const call = client(srv.base);
    await call('POST', '/api/auth/register', { username: 'ivan', password: 'ivan-password' });
    const bad = [
      { ...RESULT, wpm: 900, raw: 900 },
      { ...RESULT, wpm: 80, raw: 60 },
      { ...RESULT, acc: 140 },
      { ...RESULT, mode: 'zen' },
      { ...RESULT, amount: 2.5 },
      { ...RESULT, wpm: '70' },
    ];
    for (const body of bad) {
      const res = await call('POST', '/api/results', body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  test('leaderboard ranks each player once, by their best run', async () => {
    const jo = client(srv.base);
    const kai = client(srv.base);
    await jo('POST', '/api/auth/register', { username: 'joe', password: 'joe-password' });
    await kai('POST', '/api/auth/register', { username: 'kai', password: 'kai-password' });
    const board = { ...RESULT, mode: 'words', amount: 50 };
    await jo('POST', '/api/results', { ...board, wpm: 70, raw: 75 });
    await jo('POST', '/api/results', { ...board, wpm: 95, raw: 99, acc: 99 });
    await kai('POST', '/api/results', { ...board, wpm: 88, raw: 90 });
    await kai('POST', '/api/results', { ...RESULT, mode: 'words', amount: 37, wpm: 200, raw: 200 }); // a level test
    const res = await client(srv.base)('GET', '/api/leaderboard?mode=words&amount=50&period=all');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.rows.map((r) => [r.rank, r.username, r.wpm]), [[1, 'joe', 95], [2, 'kai', 88]]);
    assert.equal(res.body.data.rows[0].acc, 99);
  });

  test('leaderboard only accepts the standard tests and periods', async () => {
    const call = client(srv.base);
    assert.equal((await call('GET', '/api/leaderboard?mode=words&amount=37')).status, 400);
    assert.equal((await call('GET', '/api/leaderboard?mode=zen&amount=30')).status, 400);
    assert.equal((await call('GET', '/api/leaderboard?period=year')).status, 400);
    assert.equal((await call('GET', '/api/leaderboard?period=constructor')).status, 400);
    assert.equal((await call('GET', '/api/leaderboard')).status, 200);
  });

  test('cross-site writes are refused', async () => {
    const call = client(srv.base);
    const res = await call('POST', '/api/auth/register', { username: 'mallory', password: 'password123' }, { Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
  });

  test('malformed JSON gets a clean 400', async () => {
    const res = await client(srv.base)('POST', '/api/auth/login', '{not json');
    assert.equal(res.status, 400);
    assert.equal(res.body.ok, false);
  });

  test('unknown API routes return 404 in the envelope', async () => {
    const res = await client(srv.base)('GET', '/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
  });
});

describe('static site', () => {
  test('serves the game but never the server code or repo files', async () => {
    const db = await openDb();
    const siteDir = fileURLToPath(new URL('../..', import.meta.url));
    const server = await new Promise((resolve) => {
      const s = createApp({ db, siteDir }).listen(0, () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const status = async (p) => (await fetch(base + p)).status;
    try {
      assert.equal(await status('/'), 200);
      assert.equal(await status('/js/app.js'), 200);
      assert.equal(await status('/css/styles.css'), 200);
      assert.equal(await status('/server/src/app.js'), 404);
      assert.equal(await status('/server/package.json'), 404);
      assert.equal(await status('/.git/config'), 404);
      assert.equal(await status('/README.md'), 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    }
  });
});

describe('rate limiting', () => {
  test('too many login attempts get a 429', async () => {
    const srv = await startServer({ auth: 10, results: 30 });
    try {
      const call = client(srv.base);
      let last;
      for (let i = 0; i < 11; i += 1) {
        last = await call('POST', '/api/auth/login', { username: 'someone', password: 'password123' });
      }
      assert.equal(last.status, 429);
    } finally {
      await srv.stop();
    }
  });
});
