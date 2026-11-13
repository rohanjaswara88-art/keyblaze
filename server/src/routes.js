/* API routes. Every response uses the envelope { ok, data } or { ok: false, error }. */
import { Router } from 'express';
import { hashPassword, verifyPassword, newSessionToken, hashToken, SESSION_MS, DUMMY_HASH } from './auth.js';
import { validateCredentials, validateResult, validateBoardQuery, parseLimit } from './validate.js';
import { setSessionCookie, clearSessionCookie, requireUser } from './session.js';
import { rateLimit } from './rate-limit.js';

const HISTORY_DEFAULT = 50;
const HISTORY_MAX = 200;
const BOARD_SIZE = 25;
const LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_RATE_LIMITS = Object.freeze({
  auth: 10, // login and register attempts per minute per IP
  results: 30, // the shortest test is 15 seconds, so 30 a minute is already generous
});

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });
const fail = (res, status, error) => res.status(status).json({ ok: false, error });

export function apiRoutes(db, { secureCookies, rateLimits = DEFAULT_RATE_LIMITS }) {
  const router = Router();
  const authLimit = rateLimit({ windowMs: LIMIT_WINDOW_MS, max: rateLimits.auth });
  const resultsLimit = rateLimit({ windowMs: LIMIT_WINDOW_MS, max: rateLimits.results });

  async function startSession(res, user) {
    const token = newSessionToken();
    await db.createSession(hashToken(token), user.id, Date.now() + SESSION_MS);
    setSessionCookie(res, token, secureCookies);
  }

  router.get('/health', (_req, res) => ok(res, { status: 'up' }));

  router.post('/auth/register', authLimit, async (req, res) => {
    const { value, error } = validateCredentials(req.body);
    if (error) return fail(res, 400, error);
    const user = await db.createUser(value.username, await hashPassword(value.password));
    if (!user) return fail(res, 409, 'That username is taken.');
    await startSession(res, user);
    return ok(res, { user }, 201);
  });

  router.post('/auth/login', authLimit, async (req, res) => {
    const { value, error } = validateCredentials(req.body);
    if (error) return fail(res, 401, 'Wrong username or password.');
    const found = await db.findUserWithHash(value.username);
    const valid = await verifyPassword(value.password, found ? found.passwordHash : DUMMY_HASH);
    if (!found || !valid) return fail(res, 401, 'Wrong username or password.');
    const { passwordHash: _omit, ...user } = found;
    await startSession(res, user);
    return ok(res, { user });
  });

  router.post('/auth/logout', async (req, res) => {
    if (req.sessionHash) await db.deleteSession(req.sessionHash);
    clearSessionCookie(res, secureCookies);
    return ok(res, null);
  });

  router.get('/me', (req, res) => ok(res, { user: req.user }));

  router.post('/results', requireUser, resultsLimit, async (req, res) => {
    const { value, error } = validateResult(req.body);
    if (error) return fail(res, 400, error);
    return ok(res, { result: await db.addResult(req.user.id, value) }, 201);
  });

  router.get('/results', requireUser, async (req, res) => {
    const limit = parseLimit(req.query.limit, HISTORY_DEFAULT, HISTORY_MAX);
    const [results, summary] = await Promise.all([db.listResults(req.user.id, limit), db.summary(req.user.id)]);
    return ok(res, { results, summary });
  });

  router.get('/leaderboard', async (req, res) => {
    const { value, error } = validateBoardQuery(req.query);
    if (error) return fail(res, 400, error);
    const { mode, amount, period, since } = value;
    const rows = await db.leaderboard({ mode, amount, since, limit: BOARD_SIZE });
    return ok(res, { mode, amount, period, rows });
  });

  router.use((_req, res) => fail(res, 404, 'Not found.'));

  return router;
}
