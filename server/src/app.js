/* Builds the Express app. Kept apart from index.js so tests can create one with an in-memory database. */
import express from 'express';
import { join } from 'node:path';
import { apiRoutes } from './routes.js';
import { loadUser, sameOriginWrites } from './session.js';

const BODY_LIMIT = '10kb';
// Only these files and folders of the site are public; the rest of the repo (server code, .git) never is.
const PUBLIC_DIRS = ['css', 'js'];
const PUBLIC_FILES = ['index.html', 'og-image.png'];

function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
}

/**
 * @param {object} options
 * @param {object} options.db        from openDb()
 * @param {string} [options.siteDir] folder holding index.html; omit to serve the API only
 * @param {boolean} [options.secureCookies] true behind HTTPS
 * @param {boolean} [options.trustProxy] true behind a hosting proxy, so req.ip is the real client
 * @param {{auth: number, results: number}} [options.rateLimits] requests per minute per IP
 */
export function createApp({ db, siteDir, secureCookies = false, trustProxy = false, rateLimits }) {
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders);

  app.use('/api', sameOriginWrites, express.json({ limit: BODY_LIMIT }), loadUser(db), apiRoutes(db, { secureCookies, rateLimits }));

  if (siteDir) {
    for (const dir of PUBLIC_DIRS) app.use(`/${dir}`, express.static(join(siteDir, dir), { fallthrough: false }));
    // `root` keeps the dotfile check to the file name, so the site may live under a folder such as .claude/
    for (const file of PUBLIC_FILES) app.get(`/${file}`, (_req, res) => res.sendFile(file, { root: siteDir }));
    app.get('/', (_req, res) => res.sendFile('index.html', { root: siteDir }));
  }

  // Malformed JSON and other errors: answer in the same envelope, without leaking internals.
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message = status === 400 ? 'Request body is not valid JSON.' : status === 404 ? 'Not found.' : 'Something went wrong.';
    res.status(status).json({ ok: false, error: status === 413 ? 'Request body is too large.' : message });
  });

  return app;
}
