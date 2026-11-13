/* Race rules as pure functions: each takes a room and returns a new room (or an error). No sockets, no
   timers and no clock of its own, so every rule can be tested directly. */

export const MAX_PLAYERS = 5;
export const MAX_WPM = 350; // faster progress than this is treated as cheating and ignored
const CHARS_PER_WORD = 5;
const PROGRESS_SLACK_CHARS = 12; // allowance for network jitter between the client and server clocks

export const STATUS = Object.freeze({
  WAITING: 'waiting', COUNTDOWN: 'countdown', RACING: 'racing', FINISHED: 'finished',
});

function wpmFor(chars, ms) {
  return ms > 0 ? Math.round((chars / CHARS_PER_WORD / (ms / 60_000)) * 10) / 10 : 0;
}

function freshPlayer({ id, name }) {
  return { id, name, progress: 0, wpm: 0, finishedAt: null, place: null, left: false };
}

function resetPlayer(p) {
  return { ...p, progress: 0, wpm: 0, finishedAt: null, place: null };
}

function updatePlayer(room, id, patch) {
  return { ...room, players: room.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}

export function createRoom({ code, isPublic, text, now }) {
  return { code, isPublic, text, status: STATUS.WAITING, hostId: null, startAt: null, players: [], createdAt: now };
}

export function activePlayers(room) {
  return room.players.filter((p) => !p.left);
}

export function addPlayer(room, player) {
  if (room.players.some((p) => p.id === player.id)) return { room };
  if (room.status !== STATUS.WAITING) return { error: 'That race has already started.' };
  if (activePlayers(room).length >= MAX_PLAYERS) return { error: 'That race is full.' };
  const players = [...room.players.filter((p) => !p.left), freshPlayer(player)];
  return { room: { ...room, players, hostId: room.hostId || player.id } };
}

/** Before a race the player is dropped; during or after it they stay listed as having left. */
export function removePlayer(room, id) {
  const players = room.status === STATUS.WAITING
    ? room.players.filter((p) => p.id !== id)
    : room.players.map((p) => (p.id === id ? { ...p, left: true } : p));
  const stillHere = players.filter((p) => !p.left);
  const hostId = room.hostId === id ? (stillHere[0] ? stillHere[0].id : null) : room.hostId;
  return { ...room, players, hostId };
}

export function startCountdown(room, now, countdownMs) {
  if (room.status !== STATUS.WAITING) return { error: 'The race is not waiting to start.' };
  if (activePlayers(room).length === 0) return { error: 'Nobody is in the race.' };
  return { room: { ...room, status: STATUS.COUNTDOWN, startAt: now + countdownMs, players: room.players.map(resetPlayer) } };
}

export function beginRace(room) {
  return room.status === STATUS.COUNTDOWN ? { ...room, status: STATUS.RACING } : room;
}

/** The most characters a human could have typed by now. */
export function maxPlausibleChars(elapsedMs) {
  return Math.floor((Math.max(0, elapsedMs) / 60_000) * MAX_WPM * CHARS_PER_WORD) + PROGRESS_SLACK_CHARS;
}

/**
 * Records how many characters a player has typed correctly. The server keeps the clock, so speeds and
 * finish times come from its own timestamps, not from anything the client claims.
 */
export function applyProgress(room, id, chars, now) {
  if (room.status !== STATUS.RACING) return { error: 'The race is not running.' };
  const player = room.players.find((p) => p.id === id && !p.left);
  if (!player) return { error: 'You are not in this race.' };
  if (player.finishedAt !== null) return { room };
  if (!Number.isInteger(chars) || chars < player.progress || chars > room.text.length) return { error: 'Invalid progress.' };
  const elapsed = now - room.startAt;
  if (chars > maxPlausibleChars(elapsed)) return { error: 'Progress is faster than humanly possible.' };

  const finished = chars === room.text.length;
  const place = finished ? room.players.filter((p) => p.place !== null).length + 1 : null;
  return {
    room: updatePlayer(room, id, { progress: chars, wpm: wpmFor(chars, elapsed), finishedAt: finished ? now : null, place }),
  };
}

/** True when every player still in the race has crossed the line. */
export function everyoneFinished(room) {
  const racers = activePlayers(room);
  return racers.length > 0 && racers.every((p) => p.finishedAt !== null);
}

export function finishRace(room) {
  return room.status === STATUS.RACING || room.status === STATUS.COUNTDOWN ? { ...room, status: STATUS.FINISHED } : room;
}

/** Back to the lobby with a new passage; players who left are cleared out. */
export function resetRoom(room, text) {
  return { ...room, text, status: STATUS.WAITING, startAt: null, players: activePlayers(room).map(resetPlayer) };
}

/** What every client sees. Socket ids are internal, so players get a short public id instead. */
export function publicView(room) {
  const indexOf = new Map(room.players.map((p, i) => [p.id, i]));
  return {
    code: room.code,
    isPublic: room.isPublic,
    status: room.status,
    text: room.text,
    startAt: room.startAt,
    hostIndex: room.hostId ? indexOf.get(room.hostId) : null,
    players: room.players.map((p) => ({
      name: p.name, progress: p.progress, wpm: p.wpm, place: p.place, finished: p.finishedAt !== null, left: p.left,
    })),
  };
}
