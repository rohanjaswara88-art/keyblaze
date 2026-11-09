/* Rendering for the results, ranks and profile views, plus the rank-up overlay. */
(function (root) {
  'use strict';

  const { ranks: Ranks, fx: Fx, sound: Sound, chart: Chart } = root.TT;
  const $ = (id) => document.getElementById(id);

  const RP_TICK_MS = 45;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function badgeFor(rank, animated) {
    return Ranks.badgeSVG(rank.tierIndex, rank.division, { animated });
  }

  function rankSubtitle(rank) {
    return `Target speed ${rank.tier.par} wpm`;
  }

  /* ---------- header chip ---------- */

  function renderChip(rp) {
    const rank = Ranks.getRank(rp);
    $('chip-badge').innerHTML = badgeFor(rank, false);
    $('chip-label').textContent = rank.label;
    $('chip-bar').style.width = `${Math.round(rank.progress * 100)}%`;
  }

  /* ---------- overlay ---------- */

  function showOverlay(rank, kicker, isDown) {
    $('overlay-kicker').textContent = kicker;
    $('overlay-kicker').classList.toggle('down', Boolean(isDown));
    $('overlay-badge').innerHTML = badgeFor(rank, true);
    $('overlay-title').textContent = rank.label;
    $('overlay-sub').textContent = rankSubtitle(rank);
    const overlay = $('overlay');
    // Restart the reveal animations each time.
    overlay.classList.remove('show');
    void overlay.offsetWidth;
    overlay.classList.add('show');
    $('overlay-close').focus();
  }

  function hideOverlay() {
    $('overlay').classList.remove('show');
  }

  /* ---------- results ---------- */

  function setRpBar(rp) {
    const rank = Ranks.getRank(rp);
    $('res-rp-bar').style.width = `${Math.round(rank.progress * 100)}%`;
    $('res-rp-text').textContent = rank.next
      ? `${rank.rpIntoDivision} / ${Ranks.RP_PER_DIVISION} RP`
      : `${rank.rp} RP`;
    $('res-next').textContent = rank.next ? `Next: ${rank.next} · ${rank.rpForNext} RP to go` : 'You are at the top. Keep pushing your RP.';
    return rank;
  }

  function setResultBadge(rank) {
    const el = $('res-badge');
    el.innerHTML = badgeFor(rank, true);
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
    $('res-rank-label').textContent = rank.label;
  }

  /** Animates the RP bar one point at a time, firing rank changes as they happen. */
  function animateRp(fromRp, toRp) {
    return new Promise((resolve) => {
      const step = toRp >= fromRp ? 1 : -1;
      const total = Math.abs(toRp - fromRp);
      const stride = Math.max(1, Math.ceil(total / 60));
      let rp = fromRp;
      let lastTier = Ranks.getRank(fromRp).label;
      setResultBadge(Ranks.getRank(fromRp));
      setRpBar(fromRp);
      if (total === 0) {
        resolve(null);
        return;
      }
      let changed = null;
      const timer = setInterval(() => {
        rp = step > 0 ? Math.min(toRp, rp + stride) : Math.max(toRp, rp - stride);
        const rank = setRpBar(rp);
        if (step > 0) Sound.rpGain();
        if (rank.label !== lastTier) {
          lastTier = rank.label;
          setResultBadge(rank);
          changed = { rank, up: step > 0 };
        }
        if (rp === toRp) {
          clearInterval(timer);
          resolve(changed);
        }
      }, RP_TICK_MS);
    });
  }

  async function renderResults(payload, rpBefore, delta, isPb) {
    const { result, series, config } = payload;
    $('pb-flag').classList.toggle('show', isPb);
    $('r-mode').textContent = `${config.mode} ${config.amount}${config.punctuation ? ' @' : ''}${config.numbers ? ' #' : ''}`;
    $('r-chars').textContent = `${result.chars.correctChars}/${result.chars.incorrectChars}/${result.chars.extraChars}/${result.chars.missedChars}`;
    $('r-time').textContent = `${result.seconds}s`;
    const deltaEl = $('res-rp-delta');
    deltaEl.textContent = `${delta > 0 ? '+' : ''}${delta} RP`;
    deltaEl.className = `rp-delta ${delta < 0 ? 'neg' : delta === 0 ? 'zero' : ''}`;
    $('r-cons-bar').style.width = '0';

    Chart.drawChart($('chart'), $('chart-tip'), series);
    Fx.countUp($('r-wpm'), 0, result.wpm, 900, 0);
    Fx.countUp($('r-acc'), 0, result.accuracy, 900, 0);
    Fx.countUp($('r-raw'), 0, result.raw, 900, 0);
    Fx.countUp($('r-cons'), 0, result.consistency, 1100, 0).then(() => { $('r-cons').textContent += '%'; });
    requestAnimationFrame(() => {
      $('r-cons-bar').style.width = `${result.consistency}%`;
      // Red at 0%, yellow around 50%, green at 100%.
      $('r-cons-bar').style.background = `hsl(${Math.round(result.consistency * 1.3)}, 85%, 55%)`;
    });

    await new Promise((r) => setTimeout(r, 700));
    return animateRp(rpBefore, Math.max(0, rpBefore + delta));
  }

  /* ---------- level challenge result ---------- */

  function levelDots(level, cleared, justCleared) {
    const tier = Ranks.TIERS[level];
    return Array.from({ length: 10 }, (_, i) => {
      const cls = i < cleared ? (justCleared && i === cleared - 1 ? 'on new' : 'on') : '';
      return `<i class="${cls}" style="--tier-light:${tier.light}"></i>`;
    }).join('');
  }

  /** Shows the pass/fail card for a level test, or hides it in free mode. */
  function renderLevelResult(outcome) {
    const box = $('res-level');
    box.hidden = !outcome;
    const next = $('next-test');
    if (!outcome) {
      next.innerHTML = 'Next test <kbd>tab</kbd>';
      return;
    }
    const { level, index, config, result, passed, cleared, levelDone, isLast } = outcome;
    const tier = Ranks.TIERS[level];
    box.classList.toggle('passed', passed);
    box.classList.toggle('failed', !passed);
    box.style.setProperty('--tier', tier.base);
    $('res-level-badge').innerHTML = Ranks.badgeSVG(level, level === Ranks.TIERS.length - 1 ? 0 : 1, { animated: passed });
    $('res-level-kicker').textContent = `Level ${level + 1} · ${tier.name} · test ${index + 1} of 10`;
    $('res-level-title').textContent = levelDone ? `${tier.name} level complete` : passed ? 'Test cleared' : 'Not quite yet';
    const wpm = Math.round(result.wpm);
    const acc = Math.round(result.accuracy);
    const missed = [];
    if (result.wpm < config.targetWpm) missed.push(`${Math.max(1, Math.round(config.targetWpm - result.wpm))} wpm short`);
    if (result.accuracy < config.minAcc) missed.push(`accuracy ${Math.max(1, Math.round(config.minAcc - result.accuracy))}% short`);
    $('res-level-text').textContent = passed
      ? `Goal was ${config.targetWpm} wpm at ${config.minAcc}% accuracy. You typed ${wpm} wpm at ${acc}%.`
      : `Goal is ${config.targetWpm} wpm at ${config.minAcc}% accuracy: ${missed.join(', ')}.`;
    $('res-level-dots').innerHTML = levelDots(level, cleared, outcome.newlyCleared);
    const label = !passed
      ? 'Try again'
      : !isLast ? `Test ${index + 2}` : level < Ranks.TIERS.length - 1 ? `Level ${level + 2}` : 'Play again';
    next.innerHTML = `${escapeHtml(label)} <kbd>tab</kbd>`;
  }

  /* ---------- ranks page ---------- */

  function renderRanks(rp) {
    const rank = Ranks.getRank(rp);
    $('hero-badge').innerHTML = badgeFor(rank, true);
    $('hero-label').textContent = rank.label;
    $('hero-bar').style.width = `${Math.round(rank.progress * 100)}%`;
    $('hero-text').textContent = rank.next
      ? `${rank.rp} RP · ${rank.rpForNext} RP to ${rank.next}`
      : `${rank.rp} RP · top rank reached`;

    const byTier = Ranks.allRanks().reduce((acc, r) => {
      (acc[r.tierIndex] = acc[r.tierIndex] || []).push(r);
      return acc;
    }, {});
    const html = Object.keys(byTier).map((key) => {
      const list = byTier[key];
      const tier = list[0].tier;
      const isApex = list[0].division === 0;
      const divs = list.map((r) => {
        const unlocked = rp >= r.minRp;
        const isCurrent = r.label === rank.label;
        const svg = Ranks.badgeSVG(r.tierIndex, r.division, { animated: isCurrent, locked: !unlocked });
        return `<button type="button" class="tier-div btn ${isCurrent ? 'current' : ''}" data-tier="${r.tierIndex}" data-div="${r.division}"` +
          ` aria-label="${escapeHtml(r.label)}"><span class="mini">${svg}</span><small>${isApex ? `${r.minRp}+ RP` : r.label.split(' ')[1]}</small></button>`;
      }).join('');
      return `<div class="tier-card glass ${isApex ? 'apex' : ''}" style="animation-delay:${Number(key) * 0.04}s">` +
        `<h4><span class="tier-name"><i class="tier-dot" style="background:${tier.base};box-shadow:0 0 10px ${tier.base}"></i>` +
        `${escapeHtml(tier.name)}</span><span>target ${tier.par} wpm</span></h4>` +
        `<div class="tier-divs">${divs}</div></div>`;
    }).join('');
    $('rank-grid').innerHTML = html;
  }

  /** One badge per tier for the landing page rail. */
  function renderRail(el) {
    el.innerHTML = Ranks.TIERS.map((tier, i) => {
      const division = i === Ranks.TIERS.length - 1 ? 0 : 1;
      return `<button type="button" class="rail-item" data-tier="${i}" data-div="${division}" aria-label="${escapeHtml(tier.name)}">` +
        `<span class="rail-badge">${Ranks.badgeSVG(i, division, { animated: false })}</span><small>${escapeHtml(tier.name)}</small></button>`;
    }).join('');
  }

  /** Opens the overlay as a preview of any badge on the ranks page. */
  function previewBadge(tierIndex, division) {
    const r = Ranks.allRanks().find((x) => x.tierIndex === tierIndex && x.division === division);
    if (!r) return;
    showOverlay({ ...r, tier: r.tier }, `${r.minRp} RP`, false);
    $('overlay-sub').textContent = rankSubtitle(r);
  }

  /* ---------- profile page ---------- */

  function renderProfile(profile) {
    const h = profile.history;
    const last10 = h.slice(-10);
    const avg = (list, key) => (list.length ? list.reduce((s, e) => s + e[key], 0) / list.length : 0);
    $('p-tests').textContent = String(h.length);
    $('p-best').textContent = String(Math.round(Math.max(0, ...h.map((e) => e.wpm))));
    $('p-avg').textContent = String(Math.round(avg(last10, 'wpm')));
    $('p-acc').textContent = `${Math.round(avg(h, 'acc'))}%`;

    const pbs = Object.entries(profile.best).sort();
    $('pb-list').innerHTML = pbs.length
      ? pbs.map(([k, v]) => `<div class="pb-item"><small>${escapeHtml(k.replace('-', ' '))}</small><b>${Math.round(v)}</b></div>`).join('')
      : '<p class="empty">Finish a test to set your first personal best.</p>';

    const rows = h.slice().reverse().map((e) => {
      const date = new Date(e.ts);
      const delta = Number(e.delta) || 0;
      const cls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
      return `<div class="h-row"><span>${Math.round(e.wpm)} wpm</span><span>${Math.round(e.acc)}%</span>` +
        `<span>${escapeHtml(`${e.mode} ${e.amount}`)}</span><span class="${cls}">${delta > 0 ? '+' : ''}${delta} RP</span>` +
        `<span>${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>`;
    }).join('');
    $('history').innerHTML = h.length
      ? `<div class="h-row head"><span>speed</span><span>accuracy</span><span>test</span><span>rating</span><span>when</span></div>${rows}`
      : '<p class="empty">No tests yet. Go type something!</p>';

    const recent = h.slice(-30);
    Chart.drawChart($('p-chart'), $('p-chart-tip'), {
      wpm: recent.map((e) => e.wpm),
      raw: recent.map((e) => e.raw),
      errors: recent.map(() => 0),
    }, { label: (i) => `test #${h.length - recent.length + i + 1}` });
  }

  root.TT = Object.assign(root.TT || {}, {
    views: { renderChip, renderResults, renderLevelResult, renderRanks, renderRail, renderProfile, showOverlay, hideOverlay, previewBadge },
  });
})(typeof window !== 'undefined' ? window : globalThis);
