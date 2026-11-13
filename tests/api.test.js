const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const API_PATH = path.join(__dirname, '../js/api.js');

/** Loads a fresh copy of js/api.js with the given fake fetch, so each test starts uncached. */
function loadApi(fakeFetch) {
  globalThis.fetch = fakeFetch;
  delete require.cache[require.resolve(API_PATH)];
  require(API_PATH);
  return globalThis.TT.api;
}

const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('available() is false on a static host where /api returns an HTML 404', async () => {
  const api = loadApi(async () => ({ ok: false, status: 404, json: async () => { throw new SyntaxError('not json'); } }));
  assert.equal(await api.available(), false);
});

test('available() is false when the network fails', async () => {
  const api = loadApi(async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(await api.available(), false);
});

test('available() is true when the health check answers', async () => {
  const api = loadApi(async () => jsonResponse(200, { ok: true, data: { status: 'up' } }));
  assert.equal(await api.available(), true);
});

test('server error messages reach the caller with their status', async () => {
  const api = loadApi(async () => jsonResponse(409, { ok: false, error: 'That username is taken.' }));
  await assert.rejects(api.register('alice', 'password123'), (err) => {
    assert.equal(err.message, 'That username is taken.');
    assert.equal(err.status, 409);
    return true;
  });
});

test('saveResult sends only the result fields', async () => {
  let sent = null;
  const api = loadApi(async (_url, init) => {
    sent = JSON.parse(init.body);
    return jsonResponse(201, { ok: true, data: { result: { id: 1 } } });
  });
  await api.saveResult({ wpm: 60, raw: 62, acc: 97, cons: 80, mode: 'time', amount: 30, delta: 12, ts: 1 });
  assert.deepEqual(sent, { wpm: 60, raw: 62, acc: 97, cons: 80, mode: 'time', amount: 30 });
});
