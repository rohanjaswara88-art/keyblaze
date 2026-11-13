/* A small fixed-window rate limiter kept in memory. Fine for one server process; a shared store
   such as Redis would be needed once there are several. */

export function rateLimit({ windowMs, max, now = Date.now }) {
  const hits = new Map(); // key -> { count, resetAt }

  function sweep(t) {
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
  }

  return function limiter(req, res, next) {
    const t = now();
    if (hits.size > 10_000) sweep(t);
    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    const current = !entry || entry.resetAt <= t ? { count: 0, resetAt: t + windowMs } : entry;
    const updated = { ...current, count: current.count + 1 };
    hits.set(key, updated);
    if (updated.count > max) {
      res.set('Retry-After', String(Math.ceil((updated.resetAt - t) / 1000)));
      return res.status(429).json({ ok: false, error: 'Too many attempts. Try again in a minute.' });
    }
    return next();
  };
}
