/* Landing page difficulty picker: badge cards in the FlexCarousel plus the ten-test level panel. */
(function (root) {
  'use strict';

  const CARD_W = 600;
  const CARD_H = 800;
  const BADGE_SIZE = 400;
  const LITE = Boolean(root.TT && root.TT.perf && root.TT.perf.lite); // phones and low-end devices
  const LIVE_SCALE = LITE ? 0.5 : 0.75; // live card texture size: 300x400 on phones, 450x600 elsewhere
  const FRAME_MS = LITE ? 50 : 33;      // card animation rate: ~20 fps on phones, ~30 fps elsewhere
  const SPARKS = 3;
  const SWEEP_EVERY = 6;     // seconds between light sweeps
  const SWEEP_TIME = 1.6;    // seconds a sweep takes
  const MODULE_TIMEOUT_MS = 6000;
  const $ = (id) => document.getElementById(id);

  const pad2 = (n) => String(n).padStart(2, '0');

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('badge image failed to load'));
      img.src = src;
    });
  }

  /** What makes a level hard, in a few words. */
  function describe(config) {
    const parts = [];
    if (config.maxLength) parts.push('short words');
    else if (config.minLength) parts.push('long words');
    else parts.push('all words');
    if (config.punctuation) parts.push('punctuation');
    if (config.numbers) parts.push('numbers');
    return parts.join(' · ');
  }

  function createDifficulty(deps) {
    const { ranks: Ranks, levels: Levels } = deps;
    const tiers = Ranks.TIERS;
    let carousel = null;
    let items = [];
    let shown = 0;
    let lastKey = '';

    const progressKey = (p) => tiers.map((_, i) => Levels.cleared(p, i)).join(',');

    /** The parts of a card that never move: violet glass, the dome, frame, level, name and progress dots. */
    function paintStatic(ctx, index, done) {
      const tier = tiers[index];
      const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
      bg.addColorStop(0, '#1d1236');
      bg.addColorStop(0.6, '#0e0820');
      bg.addColorStop(1, '#07040f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, CARD_W, CARD_H);

      // Lavender dome along the bottom edge, echoing the page background.
      const dome = ctx.createRadialGradient(CARD_W / 2, CARD_H + 260, 200, CARD_W / 2, CARD_H + 260, 420);
      dome.addColorStop(0, 'rgba(167,139,250,0)');
      dome.addColorStop(0.82, 'rgba(167,139,250,0.10)');
      dome.addColorStop(0.95, 'rgba(216,200,255,0.55)');
      dome.addColorStop(1, 'rgba(216,200,255,0)');
      ctx.fillStyle = dome;
      ctx.fillRect(0, 0, CARD_W, CARD_H);

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(22, 22, CARD_W - 44, CARD_H - 44);

      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '500 22px "Geist Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`LEVEL ${pad2(index + 1)}`.split('').join(String.fromCharCode(8202)), CARD_W / 2, 84);

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = 'italic 64px "Instrument Serif", serif';
      ctx.fillText(tier.name, CARD_W / 2, 650);

      const gap = 30;
      const startX = CARD_W / 2 - (gap * (Levels.TESTS_PER_LEVEL - 1)) / 2;
      for (let i = 0; i < Levels.TESTS_PER_LEVEL; i += 1) {
        ctx.beginPath();
        ctx.arc(startX + i * gap, 712, 6, 0, Math.PI * 2);
        ctx.fillStyle = i < done ? tier.light : 'rgba(255,255,255,0.16)';
        ctx.fill();
      }
    }

    /**
     * A living card for the carousel. The emblem keeps its own SVG animation (rays, wings, eyes),
     * floats, breathes a tier-coloured glow, has sparks orbiting it and a light sweep across the glass.
     */
    async function createLiveCard(index, done) {
      const tier = tiers[index];
      const phase = index * 0.77; // cards move out of step with each other
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(CARD_W * LIVE_SCALE);
      canvas.height = Math.round(CARD_H * LIVE_SCALE);
      const ctx = canvas.getContext('2d');

      const still = document.createElement('canvas');
      still.width = canvas.width;
      still.height = canvas.height;
      const stillCtx = still.getContext('2d');
      stillCtx.setTransform(LIVE_SCALE, 0, 0, LIVE_SCALE, 0, 0);
      paintStatic(stillCtx, index, done);

      const svg = Ranks.badgeSVG(index, 0, { animated: true })
        .replace('<svg ', `<svg width="${BADGE_SIZE}" height="${BADGE_SIZE}" `);
      const badge = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
      let lastTick = -1;

      function draw(now) {
        const t = now / 1000 + phase;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(still, 0, 0);
        ctx.setTransform(LIVE_SCALE, 0, 0, LIVE_SCALE, 0, 0);

        const cx = CARD_W / 2;
        const cy = 370 + Math.sin(t * 1.3) * 9;

        // Breathing glow behind the emblem.
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.7);
        const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 300 + pulse * 50);
        glow.addColorStop(0, `${tier.base}${Math.round(70 + pulse * 60).toString(16)}`);
        glow.addColorStop(1, `${tier.base}00`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 90, CARD_W, 540);

        // Floating emblem with a gentle scale breath.
        const size = BADGE_SIZE * (1 + Math.sin(t * 1.3 + 1) * 0.02);
        ctx.drawImage(badge, cx - size / 2, cy - size / 2, size, size);

        // Sparks orbiting the emblem on a tilted ellipse.
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < SPARKS; i += 1) {
          const a = t * 0.9 + (i / SPARKS) * Math.PI * 2;
          const x = cx + Math.cos(a) * 215;
          const y = cy + Math.sin(a) * 70 + Math.cos(a) * 26;
          const front = Math.sin(a) > 0 ? 1 : 0.45;
          const r = (4 + 2 * Math.sin(t * 3 + i)) * front;
          const spark = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
          spark.addColorStop(0, tier.light);
          spark.addColorStop(1, `${tier.base}00`);
          ctx.fillStyle = spark;
          ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
        }

        // A diagonal light sweep across the glass every few seconds.
        const cycle = (t % SWEEP_EVERY) / SWEEP_TIME;
        if (cycle < 1) {
          const x = -300 + cycle * (CARD_W + 600);
          const sweep = ctx.createLinearGradient(x - 120, 0, x + 120, 0);
          sweep.addColorStop(0, 'rgba(255,255,255,0)');
          sweep.addColorStop(0.5, 'rgba(235,225,255,0.16)');
          sweep.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.save();
          ctx.translate(x, CARD_H / 2);
          ctx.rotate(0.35);
          ctx.translate(-x, -CARD_H / 2);
          ctx.fillStyle = sweep;
          ctx.fillRect(x - 140, -200, 280, CARD_H + 400);
          ctx.restore();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      draw(0);
      return {
        canvas,
        src: canvas.toDataURL('image/png'), // still frame for the no-WebGL fallback
        color: [0.18, 0.1, 0.32],
        /** Redraws at most ~30 times a second; returns true when the texture changed. */
        animate(now) {
          // Every card shares the same ticks, so the carousel re-renders once per tick, not once per card.
          const tick = Math.floor(now / FRAME_MS);
          if (tick === lastTick) return false;
          lastTick = tick;
          draw(now);
          return true;
        },
      };
    }

    async function buildItems(progress) {
      return Promise.all(tiers.map(async (tier, i) => {
        const first = Levels.testConfig(i, 0);
        const last = Levels.testConfig(i, Levels.TESTS_PER_LEVEL - 1);
        const card = await createLiveCard(i, Levels.cleared(progress, i));
        return {
          ...card,
          alt: `${tier.name} level badge`,
          title: `Level ${i + 1} · ${tier.name}`,
          subtitle: `${first.targetWpm} to ${last.targetWpm} wpm · ${Levels.cleared(progress, i)}/10 cleared`,
        };
      }));
    }

    /* ---------- level panel ---------- */

    function renderPanel(index) {
      shown = index;
      const panel = $('level-panel');
      const tier = tiers[index];
      const progress = deps.getProgress();
      const done = Levels.cleared(progress, index);
      const next = Levels.nextTest(progress, index);
      const first = Levels.testConfig(index, 0);
      const last = Levels.testConfig(index, Levels.TESTS_PER_LEVEL - 1);
      const tests = Array.from({ length: Levels.TESTS_PER_LEVEL }, (_, t) => {
        const c = Levels.testConfig(index, t);
        const state = t < done ? 'done' : Levels.isUnlocked(progress, index, t) ? 'next' : 'locked';
        return `<button type="button" class="lp-test btn ${state}" data-test="${t}" ${state === 'locked' ? 'disabled' : ''}` +
          ` aria-label="Test ${t + 1}, ${c.targetWpm} wpm, ${state}"><b>${pad2(t + 1)}</b><small>${c.targetWpm} wpm</small></button>`;
      }).join('');
      const finished = done >= Levels.TESTS_PER_LEVEL;
      panel.style.setProperty('--tier', tier.base);
      panel.style.setProperty('--tier-light', tier.light);
      panel.innerHTML =
        `<div class="lp-head"><span class="lp-badge">${Ranks.badgeSVG(index, index === tiers.length - 1 ? 0 : 1, { animated: true })}</span>` +
        `<div class="lp-info"><small>Level ${pad2(index + 1)} of ${tiers.length}</small><h3>${escapeHtml(tier.name)}</h3>` +
        `<p>${first.targetWpm} to ${last.targetWpm} wpm · ${first.minAcc}%+ accuracy · ${first.amount} to ${last.amount} words · ${describe(first)}</p></div>` +
        `<div class="lp-progress"><b>${done}</b><span>/10 cleared</span><i style="width:${done * 10}%"></i></div></div>` +
        `<div class="lp-tests">${tests}</div>` +
        `<div class="lp-actions"><button type="button" class="launch btn" id="lp-start">${finished ? 'Replay test 10' : `Start test ${next + 1}`}</button>` +
        `<span class="lp-hint">Pass a test to open the next one. Goal: ${Levels.testConfig(index, next).targetWpm} wpm at ${Levels.testConfig(index, next).minAcc}% accuracy.</span></div>`;
    }

    function choose(index) {
      renderPanel(index);
      const panel = $('level-panel');
      panel.classList.remove('chosen');
      void panel.offsetWidth;
      panel.classList.add('chosen');
      deps.sound.combo(Math.min(9, index));
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function bindPanel() {
      $('level-panel').addEventListener('click', (e) => {
        const testBtn = e.target.closest('[data-test]');
        if (testBtn && !testBtn.disabled) {
          deps.startTest(shown, Number(testBtn.dataset.test));
          return;
        }
        if (e.target.closest('#lp-start')) deps.startTest(shown, Levels.nextTest(deps.getProgress(), shown));
      });
      $('flex-fallback').addEventListener('click', (e) => {
        const card = e.target.closest('[data-level]');
        if (card) choose(Number(card.dataset.level));
      });
    }

    /* ---------- carousel ---------- */

    function mountFallback() {
      const box = $('flex-fallback');
      box.hidden = false;
      $('flex-carousel').hidden = true;
      box.innerHTML = items.map((item, i) =>
        `<button type="button" class="fallback-card btn" data-level="${i}"><img src="${item.src}" alt="${escapeHtml(item.alt)}"></button>`).join('');
    }

    function mountCarousel() {
      if (carousel || !root.TT.createFlexCarousel) return;
      carousel = root.TT.createFlexCarousel($('flex-carousel'), {
        items,
        preset: 'liquid',
        intro: 'rise',
        cardHeight: 0.62,
        maxDpr: LITE ? 1.5 : 2,
        dispersion: LITE ? 0 : undefined, // the rainbow split costs 12 texture reads per pixel
        gap: 18,
        radius: 18,
        squeeze: 0.2,
        focusOnClick: true,
        captions: true,
        ariaLabel: 'Difficulty levels',
        onChange: (index) => renderPanel(index),
        onSelect: (index) => choose(index),
      });
      if (!carousel) mountFallback();
    }

    async function init() {
      bindPanel();
      renderPanel(0);
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      try {
        items = await buildItems(deps.getProgress());
      } catch (err) {
        console.error('Could not draw the level badges:', err);
        return;
      }
      lastKey = progressKey(deps.getProgress());
      if (root.TT.createFlexCarousel) {
        mountCarousel();
        return;
      }
      root.addEventListener('tt:flex-carousel-ready', mountCarousel, { once: true });
      // The carousel loads from a CDN; without it the badges still work as plain buttons.
      setTimeout(() => { if (!carousel) mountFallback(); }, MODULE_TIMEOUT_MS);
    }

    /** Redraws cards and the panel after progress changed. */
    async function refresh() {
      const progress = deps.getProgress();
      renderPanel(shown);
      const key = progressKey(progress);
      if (key === lastKey || !items.length) return;
      lastKey = key;
      items = await buildItems(progress);
      if (carousel) carousel.setItems(items);
      else if (!$('flex-fallback').hidden) mountFallback();
    }

    init();
    return { refresh, describe };
  }

  root.TT = Object.assign(root.TT || {}, { difficulty: { init: createDifficulty, describe } });
})(typeof window !== 'undefined' ? window : globalThis);
