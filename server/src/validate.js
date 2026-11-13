/* Input validation for every request body. Each validator returns { value } or { error }. */

export const USERNAME_RULE = /^[a-zA-Z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const MAX_WPM = 350; // well above the world record, so anything higher is not a real test
const LEVEL_MODES = new Set(['time', 'words']);

function isNumberIn(n, min, max) {
  return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
}

export function validateCredentials(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || !USERNAME_RULE.test(username)) {
    return { error: 'Username must be 3 to 20 letters, numbers or underscores.' };
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return { error: `Password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.` };
  }
  return { value: { username, password } };
}

/** A finished test. Level tests use custom lengths, so any amount in range is accepted. */
export function validateResult(body) {
  const { wpm, raw, acc, cons, mode, amount } = body || {};
  if (!LEVEL_MODES.has(mode)) return { error: 'mode must be "time" or "words".' };
  if (!Number.isInteger(amount) || amount < 1 || amount > 1000) return { error: 'amount must be a whole number from 1 to 1000.' };
  if (!isNumberIn(wpm, 0, MAX_WPM)) return { error: `wpm must be between 0 and ${MAX_WPM}.` };
  if (!isNumberIn(raw, 0, MAX_WPM)) return { error: `raw must be between 0 and ${MAX_WPM}.` };
  if (wpm > raw + 0.5) return { error: 'wpm cannot be higher than raw speed.' };
  if (!isNumberIn(acc, 0, 100)) return { error: 'acc must be between 0 and 100.' };
  if (!isNumberIn(cons, 0, 100)) return { error: 'cons must be between 0 and 100.' };
  return { value: { wpm, raw, acc, cons, mode, amount } };
}

/** The standard test lengths; level tests use other lengths and stay off the leaderboard. */
export const BOARD_TESTS = Object.freeze({ time: [15, 30, 60, 120], words: [10, 25, 50, 100] });
const DAY_MS = 24 * 60 * 60 * 1000;
export const BOARD_PERIODS = Object.freeze({ day: DAY_MS, week: 7 * DAY_MS, all: Infinity });

export function validateBoardQuery(query, now = Date.now()) {
  const mode = query.mode || 'time';
  const amount = Number(query.amount || 30);
  const period = query.period || 'all';
  if (!BOARD_TESTS[mode] || !BOARD_TESTS[mode].includes(amount)) {
    return { error: 'Pick a standard test: time 15/30/60/120 or words 10/25/50/100.' };
  }
  if (!Object.hasOwn(BOARD_PERIODS, period)) return { error: 'period must be day, week or all.' };
  const span = BOARD_PERIODS[period];
  return { value: { mode, amount, period, since: span === Infinity ? 0 : now - span } };
}

export function parseLimit(value, fallback, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}
