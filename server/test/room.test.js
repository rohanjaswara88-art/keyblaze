import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS, MAX_PLAYERS, createRoom, addPlayer, removePlayer, startCountdown, beginRace, applyProgress,
  everyoneFinished, resetRoom, publicView, maxPlausibleChars,
} from '../src/race/room.js';

const TEXT = 'the quick brown fox'; // 19 characters
const T0 = 1_000_000;

function lobby(...names) {
  return names.reduce((room, name) => addPlayer(room, { id: name, name }).room,
    createRoom({ code: 'ABCDE', isPublic: false, text: TEXT, now: T0 }));
}

function racing(...names) {
  return beginRace(startCountdown(lobby(...names), T0, 3000).room); // the race starts at T0 + 3000
}

test('the first player to join becomes host, and the host passes on when they leave', () => {
  const room = lobby('ana', 'ben');
  assert.equal(room.hostId, 'ana');
  assert.equal(removePlayer(room, 'ana').hostId, 'ben');
});

test('rooms are capped and closed once the race starts', () => {
  const names = Array.from({ length: MAX_PLAYERS }, (_, i) => `p${i}`);
  assert.equal(addPlayer(lobby(...names), { id: 'late', name: 'late' }).error, 'That race is full.');
  assert.match(addPlayer(racing('ana'), { id: 'late', name: 'late' }).error, /already started/);
});

test('leaving before the race removes you; leaving during it keeps your lane', () => {
  assert.equal(removePlayer(lobby('ana', 'ben'), 'ben').players.length, 1);
  const mid = removePlayer(racing('ana', 'ben'), 'ben');
  assert.equal(mid.players.length, 2);
  assert.equal(mid.players[1].left, true);
});

test('progress only counts while racing and only moves forward', () => {
  assert.ok(applyProgress(lobby('ana'), 'ana', 3, T0).error);
  let room = racing('ana');
  room = applyProgress(room, 'ana', 4, T0 + 3000 + 2000).room;
  assert.equal(room.players[0].progress, 4);
  assert.ok(applyProgress(room, 'ana', 2, T0 + 6000).error, 'going backwards');
  assert.ok(applyProgress(room, 'ana', 99, T0 + 60_000).error, 'past the end');
  assert.ok(applyProgress(room, 'ana', 5.5, T0 + 6000).error, 'not a whole number');
});

test('impossible speed is rejected using the server clock', () => {
  const room = racing('ana');
  const justAfterStart = T0 + 3000 + 100;
  assert.ok(maxPlausibleChars(100) < TEXT.length);
  assert.match(applyProgress(room, 'ana', TEXT.length, justAfterStart).error, /humanly possible/);
});

test('finishing sets place and a server-timed wpm', () => {
  let room = racing('ana', 'ben');
  const start = T0 + 3000;
  room = applyProgress(room, 'ben', TEXT.length, start + 12_000).room;
  room = applyProgress(room, 'ana', TEXT.length, start + 15_000).room;
  const [ana, ben] = room.players;
  assert.equal(ben.place, 1);
  assert.equal(ana.place, 2);
  assert.equal(ben.wpm, 19); // 19 chars = 3.8 words in 0.2 minutes
  assert.ok(everyoneFinished(room));
});

test('a race with one finisher and one leaver is over', () => {
  let room = racing('ana', 'ben');
  room = applyProgress(room, 'ana', TEXT.length, T0 + 20_000).room;
  assert.equal(everyoneFinished(room), false);
  assert.equal(everyoneFinished(removePlayer(room, 'ben')), true);
});

test('reset brings everyone back to the lobby with a new passage', () => {
  let room = racing('ana', 'ben');
  room = removePlayer(applyProgress(room, 'ana', 5, T0 + 10_000).room, 'ben');
  const next = resetRoom(room, 'new words here');
  assert.equal(next.status, STATUS.WAITING);
  assert.equal(next.text, 'new words here');
  assert.deepEqual(next.players.map((p) => [p.id, p.progress]), [['ana', 0]]);
});

test('the public view never exposes socket ids', () => {
  const view = publicView(lobby('ana', 'ben'));
  assert.equal(view.hostIndex, 0);
  assert.equal(JSON.stringify(view).includes('"id"'), false);
});
