/* Leaderboard view: each player's best run for one standard test, for today, this week or all time. */
(function (root) {
  'use strict';

  const TESTS = { time: [15, 30, 60, 120], words: [10, 25, 50, 100] };
  const PERIODS = [['day', 'today'], ['week', 'this week'], ['all', 'all time']];
  const PLACE_CLASS = ['gold', 'silver', 'bronze'];

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const pill = (attr, value, label, on) =>
    `<button class="pill btn ${on ? 'on' : ''}" ${attr}="${value}" type="button">${escapeHtml(label)}</button>`;

  function create({ api, currentUser }) {
    const $ = (id) => document.getElementById(id);
    let filters = { mode: 'time', amount: 30, period: 'all' };
    let requestId = 0; // ignores answers to filters the player has already moved past

    function renderFilters() {
      $('board-modes').innerHTML = Object.keys(TESTS).map((m) => pill('data-board-mode', m, m, m === filters.mode)).join('');
      $('board-amounts').innerHTML = TESTS[filters.mode].map((n) => pill('data-board-amount', n, String(n), n === filters.amount)).join('');
      $('board-periods').innerHTML = PERIODS.map(([v, label]) => pill('data-board-period', v, label, v === filters.period)).join('');
    }

    function renderRows(rows) {
      const me = currentUser();
      if (!rows.length) {
        $('board-body').innerHTML = '<p class="empty">No runs here yet. Sign in, finish this test and claim first place.</p>';
        return;
      }
      const head = '<div class="b-row head"><span>#</span><span>player</span><span>wpm</span><span>accuracy</span><span>when</span></div>';
      $('board-body').innerHTML = head + rows.map((r) => {
        const cls = [PLACE_CLASS[r.rank - 1] || '', me && r.username.toLowerCase() === me.toLowerCase() ? 'me' : ''].join(' ');
        return `<div class="b-row ${cls}"><span class="b-rank">${r.rank}</span><span class="b-name">${escapeHtml(r.username)}</span>` +
          `<span>${Math.round(r.wpm)}</span><span>${Math.round(r.acc)}%</span><span>${new Date(r.ts).toLocaleDateString()}</span></div>`;
      }).join('');
    }

    async function load() {
      renderFilters();
      if (!(await api.available())) {
        $('board-body').innerHTML = '<p class="empty">The leaderboard needs the Keyblaze server. Run it locally to see rankings.</p>';
        return;
      }
      const id = ++requestId;
      $('board-body').innerHTML = '<p class="empty">Loading…</p>';
      try {
        const data = await api.leaderboard(filters);
        if (id === requestId) renderRows(data.rows);
      } catch (err) {
        if (id === requestId) $('board-body').innerHTML = `<p class="empty">${escapeHtml(err.message)}</p>`;
      }
    }

    $('view-leaders').addEventListener('click', (e) => {
      const b = e.target.closest('[data-board-mode], [data-board-amount], [data-board-period]');
      if (!b) return;
      if (b.dataset.boardMode) {
        const mode = b.dataset.boardMode;
        filters = { ...filters, mode, amount: TESTS[mode][1] };
      } else if (b.dataset.boardAmount) {
        filters = { ...filters, amount: Number(b.dataset.boardAmount) };
      } else {
        filters = { ...filters, period: b.dataset.boardPeriod };
      }
      load();
    });

    return { show: load };
  }

  root.TT = Object.assign(root.TT || {}, { leaderboard: { create } });
})(typeof window !== 'undefined' ? window : globalThis);
