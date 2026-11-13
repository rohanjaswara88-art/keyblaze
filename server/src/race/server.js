/* Live races over Socket.IO: rooms, quick match, countdowns and timeouts. The race rules live in
   room.js; this file only moves messages and runs timers. */
import { Server } from 'socket.io';
import { randomInt } from 'node:crypto';
import {
  STATUS, MAX_PLAYERS, createRoom, addPlayer, removePlayer, startCountdown, beginRace, applyProgress,
  everyoneFinished, finishRace, resetRoom, publicView, activePlayers,
} from './room.js';
import { hashToken } from '../auth.js';
import { COOKIE_NAME, readCookie } from '../session.js';

export const DEFAULT_RACE_OPTIONS = Object.freeze({
  countdownMs: 3_000,
  maxRaceMs: 120_000, // a race ends after two minutes even if someone never finishes
  autoStartMs: 8_000, // a quick-match room starts this long after a second player arrives
  maxRooms: 500,
  words: 30,
});
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L, which are easy to misread
const CODE_LENGTH = 5;
const EVENTS_PER_SECOND = 20;

function newCode(taken) {
  for (;;) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!taken.has(code)) return code;
  }
}

/** Browsers always send Origin for WebSockets, so refusing other origins blocks cross-site hijacking. */
function sameOrigin(req, callback) {
  const { origin, host } = req.headers;
  if (!origin) return callback(null, true);
  let originHost = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    originHost = null;
  }
  return callback(null, originHost === host);
}

/** A per-socket budget, so one client cannot flood the server with events. */
function eventBudget(now) {
  let windowStart = now();
  let count = 0;
  return () => {
    const t = now();
    if (t - windowStart >= 1000) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    return count <= EVENTS_PER_SECOND;
  };
}

/**
 * @param {import('node:http').Server} httpServer
 * @param {object} deps
 * @param {object} deps.db              from openDb(), to look up signed-in users
 * @param {(count: number) => string[]} deps.makeWords
 * @param {object} [deps.options]       overrides for DEFAULT_RACE_OPTIONS (tests use short timers)
 * @param {() => number} [deps.now]
 */
export function attachRaceServer(httpServer, { db, makeWords, options = {}, now = Date.now }) {
  const opts = { ...DEFAULT_RACE_OPTIONS, ...options };
  const io = new Server(httpServer, { allowRequest: sameOrigin, serveClient: true, maxHttpBufferSize: 4096 });
  const rooms = new Map(); // code -> room
  const roomOf = new Map(); // socket id -> code
  const timers = new Map(); // code -> { countdown, timeout, autoStart }

  const newText = () => makeWords(opts.words).join(' ');

  function clearTimers(code) {
    const t = timers.get(code);
    if (t) Object.values(t).forEach((handle) => handle && clearTimeout(handle));
    timers.delete(code);
  }

  function setTimer(code, name, ms, fn) {
    const t = timers.get(code) || {};
    if (t[name]) clearTimeout(t[name]);
    timers.set(code, { ...t, [name]: setTimeout(fn, ms) });
  }

  /** Stores the room and sends every player a fresh snapshot, marking which lane is theirs. */
  function publish(room) {
    rooms.set(room.code, room);
    const view = publicView(room);
    room.players.forEach((p, i) => {
      if (!p.left) io.to(p.id).emit('race:state', { ...view, youIndex: i, serverNow: now() });
    });
  }

  function endRace(code) {
    const room = rooms.get(code);
    if (!room) return;
    clearTimers(code);
    publish(finishRace(room));
  }

  function start(code) {
    const room = rooms.get(code);
    if (!room) return { error: 'Race not found.' };
    const result = startCountdown(room, now(), opts.countdownMs);
    if (result.error) return result;
    clearTimers(code);
    publish(result.room);
    setTimer(code, 'countdown', opts.countdownMs, () => {
      const current = rooms.get(code);
      if (current) publish(beginRace(current));
    });
    setTimer(code, 'timeout', opts.countdownMs + opts.maxRaceMs, () => endRace(code));
    return { room: result.room };
  }

  /** Quick-match rooms start on their own while at least two racers are waiting. */
  function scheduleAutoStart(room) {
    if (!room.isPublic || room.status !== STATUS.WAITING) return;
    const t = timers.get(room.code) || {};
    if (activePlayers(room).length >= 2) {
      if (!t.autoStart) setTimer(room.code, 'autoStart', opts.autoStartMs, () => start(room.code));
    } else if (t.autoStart) {
      clearTimeout(t.autoStart);
      timers.set(room.code, { ...t, autoStart: null });
    }
  }

  function leave(socket) {
    const code = roomOf.get(socket.id);
    if (!code) return;
    roomOf.delete(socket.id);
    socket.leave(code);
    const room = rooms.get(code);
    if (!room) return;
    const next = removePlayer(room, socket.id);
    if (activePlayers(next).length === 0) {
      clearTimers(code);
      rooms.delete(code);
      return;
    }
    if (next.status === STATUS.RACING && everyoneFinished(next)) {
      rooms.set(code, next);
      endRace(code);
      return;
    }
    publish(next);
    scheduleAutoStart(next);
  }

  function join(socket, room) {
    if (roomOf.get(socket.id) === room.code) return { room }; // already here
    const result = addPlayer(room, { id: socket.id, name: socket.data.name });
    if (result.error) return result;
    leave(socket); // a player is only ever in one race
    socket.join(room.code);
    roomOf.set(socket.id, room.code);
    publish(result.room);
    scheduleAutoStart(result.room);
    return { room: result.room };
  }

  function openRoom(isPublic) {
    if (rooms.size >= opts.maxRooms) return { error: 'The server is busy. Try again in a minute.' };
    const room = createRoom({ code: newCode(rooms), isPublic, text: newText(), now: now() });
    rooms.set(room.code, room);
    return { room };
  }

  // Signed-in players race under their username; everyone else gets a guest name.
  io.use((socket, next) => {
    const token = readCookie(socket.request, COOKIE_NAME);
    const user = token ? db.userForSession(hashToken(token)) : null;
    socket.data.name = user ? user.username : `guest-${randomInt(1000, 10000)}`;
    socket.data.signedIn = Boolean(user);
    next();
  });

  io.on('connection', (socket) => {
    const withinBudget = eventBudget(now);

    /** Wraps a handler: checks the event budget, always answers the ack, and never throws. */
    const handle = (fn) => (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!withinBudget()) return reply({ ok: false, error: 'Slow down.' });
      try {
        const result = fn(payload || {});
        return reply(result && result.error ? { ok: false, error: result.error } : { ok: true, code: result && result.room ? result.room.code : undefined });
      } catch (err) {
        console.error('race event failed:', err);
        return reply({ ok: false, error: 'Something went wrong.' });
      }
    };

    socket.emit('race:hello', { name: socket.data.name, signedIn: socket.data.signedIn });

    socket.on('race:create', handle(() => {
      const opened = openRoom(false);
      return opened.error ? opened : join(socket, opened.room);
    }));

    socket.on('race:join', handle(({ code }) => {
      const room = typeof code === 'string' ? rooms.get(code.trim().toUpperCase()) : null;
      if (!room) return { error: 'No race with that code.' };
      return join(socket, room);
    }));

    socket.on('race:quick', handle(() => {
      const open = [...rooms.values()].find((r) => r.isPublic && r.status === STATUS.WAITING && activePlayers(r).length < MAX_PLAYERS
        && r.code !== roomOf.get(socket.id));
      if (open) return join(socket, open);
      const opened = openRoom(true);
      return opened.error ? opened : join(socket, opened.room);
    }));

    socket.on('race:start', handle(() => {
      const room = rooms.get(roomOf.get(socket.id));
      if (!room) return { error: 'You are not in a race.' };
      if (room.hostId !== socket.id) return { error: 'Only the host can start the race.' };
      return start(room.code);
    }));

    socket.on('race:progress', handle(({ chars }) => {
      const room = rooms.get(roomOf.get(socket.id));
      if (!room) return { error: 'You are not in a race.' };
      const result = applyProgress(room, socket.id, chars, now());
      if (result.error) return result;
      if (everyoneFinished(result.room)) {
        rooms.set(room.code, result.room);
        endRace(room.code);
      } else {
        publish(result.room);
      }
      return { room: result.room };
    }));

    socket.on('race:again', handle(() => {
      const room = rooms.get(roomOf.get(socket.id));
      if (!room) return { error: 'You are not in a race.' };
      if (room.hostId !== socket.id) return { error: 'Only the host can start a new race.' };
      if (room.status !== STATUS.FINISHED) return { error: 'The race is not over yet.' };
      const next = resetRoom(room, newText());
      publish(next);
      scheduleAutoStart(next);
      return { room: next };
    }));

    socket.on('race:leave', handle(() => {
      leave(socket);
      return {};
    }));

    socket.on('disconnect', () => leave(socket));
  });

  return {
    io,
    roomCount: () => rooms.size,
    close: () => new Promise((resolve) => {
      [...timers.keys()].forEach(clearTimers);
      io.close(() => resolve());
    }),
  };
}
