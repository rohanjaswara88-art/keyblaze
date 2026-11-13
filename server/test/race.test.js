import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { attachRaceServer } from '../src/race/server.js';

const TEXT_WORDS = ['ab', 'cd']; // "ab cd": 5 characters, so a test race finishes almost at once

async function startServer(options) {
  const db = await openDb();
  const server = await new Promise((resolve) => {
    const s = createApp({ db }).listen(0, () => resolve(s));
  });
  const races = attachRaceServer(server, {
    db,
    makeWords: () => TEXT_WORDS,
    options: { countdownMs: 50, maxRaceMs: 2000, autoStartMs: 100, ...options },
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  return {
    url,
    db,
    races,
    async player(headers = {}) {
      const socket = connect(url, { transports: ['websocket'], forceNew: true, extraHeaders: headers });
      sockets.push(socket);
      const hello = await new Promise((resolve, reject) => {
        socket.once('race:hello', resolve);
        socket.once('connect_error', reject);
      });
      return { socket, name: hello.name };
    },
    async stop() {
      sockets.forEach((s) => s.disconnect());
      await races.close(); // also closes the HTTP server
      await db.close();
    },
  };
}

const send = (socket, event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));

/** Resolves with the next race:state that matches. */
const stateWhere = (socket, match) => new Promise((resolve) => {
  const onState = (state) => {
    if (match(state)) {
      socket.off('race:state', onState);
      resolve(state);
    }
  };
  socket.on('race:state', onState);
});

describe('live races', () => {
  let srv;
  before(async () => { srv = await startServer(); });
  after(async () => { await srv.stop(); });

  test('two players race a private room from start to finish', async () => {
    const host = await srv.player();
    const guest = await srv.player();

    const created = await send(host.socket, 'race:create');
    assert.equal(created.ok, true);
    assert.match(created.code, /^[A-Z2-9]{5}$/);

    const joined = await send(guest.socket, 'race:join', { code: created.code.toLowerCase() });
    assert.equal(joined.ok, true);

    const notHost = await send(guest.socket, 'race:start');
    assert.equal(notHost.ok, false);

    const racingSeen = stateWhere(guest.socket, (s) => s.status === 'racing');
    assert.equal((await send(host.socket, 'race:start')).ok, true);
    const racing = await racingSeen;
    assert.equal(racing.text, 'ab cd');
    assert.equal(racing.youIndex, 1);

    await new Promise((r) => setTimeout(r, 400)); // type at a human pace
    const finished = stateWhere(host.socket, (s) => s.status === 'finished');
    assert.equal((await send(guest.socket, 'race:progress', { chars: 5 })).ok, true);
    assert.equal((await send(host.socket, 'race:progress', { chars: 5 })).ok, true);
    const end = await finished;
    assert.deepEqual(end.players.map((p) => p.place), [2, 1]);
    assert.ok(end.players[1].wpm > 0);
  });

  test('joining a missing room fails cleanly', async () => {
    const p = await srv.player();
    const res = await send(p.socket, 'race:join', { code: 'ZZZZZ' });
    assert.deepEqual(res, { ok: false, error: 'No race with that code.' });
  });

  test('quick match puts players together and starts on its own', async () => {
    const a = await srv.player();
    const b = await srv.player();
    const first = await send(a.socket, 'race:quick');
    const second = await send(b.socket, 'race:quick');
    assert.equal(first.code, second.code);
    const started = await stateWhere(a.socket, (s) => s.status === 'countdown' || s.status === 'racing');
    assert.equal(started.players.length, 2);
  });

  test('when everyone leaves, the room is removed', async () => {
    const before = srv.races.roomCount();
    const p = await srv.player();
    await send(p.socket, 'race:create');
    assert.equal(srv.races.roomCount(), before + 1);
    await send(p.socket, 'race:leave');
    assert.equal(srv.races.roomCount(), before);
  });

  test('signed-in players race under their username', async () => {
    const res = await fetch(`${srv.url}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'racer_x', password: 'racer-password' }),
    });
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const p = await srv.player({ Cookie: cookie });
    assert.equal(p.name, 'racer_x');
    const guest = await srv.player();
    assert.match(guest.name, /^guest-\d{4}$/);
  });

  test('connections from another site are refused', async () => {
    await assert.rejects(srv.player({ Origin: 'https://evil.example' }));
  });
});

describe('race limits', () => {
  test('the room cap stops new rooms', async () => {
    const srv = await startServer({ maxRooms: 1 });
    try {
      const a = await srv.player();
      const b = await srv.player();
      assert.equal((await send(a.socket, 'race:create')).ok, true);
      const res = await send(b.socket, 'race:create');
      assert.equal(res.ok, false);
      assert.match(res.error, /busy/);
    } finally {
      await srv.stop();
    }
  });
});
