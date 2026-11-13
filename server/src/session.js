/* Session cookie handling and the middleware that loads the signed-in user. */
import { hashToken, SESSION_MS } from './auth.js';

export const COOKIE_NAME = 'kb_session';

export function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function setSessionCookie(res, token, secure) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // page scripts cannot read it, which limits the damage of any XSS bug
    sameSite: 'lax', // not sent on cross-site form posts
    secure,
    maxAge: SESSION_MS,
    path: '/',
  });
}

export function clearSessionCookie(res, secure) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

/** Sets req.user (or null) and req.sessionHash from the cookie. */
export function loadUser(db) {
  return (req, _res, next) => {
    const token = readCookie(req, COOKIE_NAME);
    req.sessionHash = token ? hashToken(token) : null;
    req.user = req.sessionHash ? db.userForSession(req.sessionHash) : null;
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Sign in first.' });
  return next();
}

/**
 * Blocks cross-site writes. Browsers always send Origin on cross-site POSTs, so a request whose
 * Origin does not match this server's host is refused.
 */
export function sameOriginWrites(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    host = null;
  }
  if (host !== req.headers.host) return res.status(403).json({ ok: false, error: 'Cross-site request refused.' });
  return next();
}
