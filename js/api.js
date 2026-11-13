/* Client for the Keyblaze server API. When the site runs without the server (for example on GitHub
   Pages), available() resolves to false and the app stays in guest mode. */
(function (root) {
  'use strict';

  const HEALTH_TIMEOUT_MS = 3000;
  let availability = null; // a cached Promise<boolean>

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function request(method, path, body) {
    let res;
    try {
      res = await root.fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new ApiError('Could not reach the server. Check your connection.', 0);
    }
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      throw new ApiError('The server sent an unexpected reply.', res.status);
    }
    if (!res.ok || !payload || !payload.ok) {
      throw new ApiError((payload && payload.error) || 'Something went wrong.', res.status);
    }
    return payload.data;
  }

  /** True when the API is reachable. Checked once per page load. */
  function available() {
    if (!availability) {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(false), HEALTH_TIMEOUT_MS));
      const check = request('GET', '/health').then((d) => Boolean(d && d.status === 'up')).catch(() => false);
      availability = Promise.race([check, timeout]);
    }
    return availability;
  }

  const api = {
    ApiError,
    available,
    me: () => request('GET', '/me').then((d) => d.user),
    register: (username, password) => request('POST', '/auth/register', { username, password }).then((d) => d.user),
    login: (username, password) => request('POST', '/auth/login', { username, password }).then((d) => d.user),
    logout: () => request('POST', '/auth/logout', {}),
    saveResult: (entry) => request('POST', '/results', {
      wpm: entry.wpm, raw: entry.raw, acc: entry.acc, cons: entry.cons, mode: entry.mode, amount: entry.amount,
    }).then((d) => d.result),
    results: (limit) => request('GET', `/results?limit=${encodeURIComponent(limit)}`),
    leaderboard: ({ mode, amount, period }) => request('GET',
      `/leaderboard?${new URLSearchParams({ mode, amount: String(amount), period })}`),
  };

  root.TT = Object.assign(root.TT || {}, { api });
})(typeof window !== 'undefined' ? window : globalThis);
