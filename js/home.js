/* Landing page interactions: self-typing demo, count-up stats, marquee, keycap playground. */
(function (root) {
  'use strict';

  const DEMO_LINES = [
    'the quiet rhythm of keys turns into pure flow when you stop thinking and simply type',
    'speed follows accuracy so slow down, stay clean and let your hands find the beat',
    'every second is measured, every mistake is marked and every rank is earned',
  ];
  const DEMO_BASE_DELAY = 125;     // ms per key, roughly 90-100 wpm
  const DEMO_TYPO_CHANCE = 0.03;
  const DEMO_LINE_PAUSE = 1800;
  const SPARK_POINTS = 40;
  const COUNT_MS = 1600;

  const $ = (id) => document.getElementById(id);

  /* ---------- marquee ---------- */

  function initMarquee() {
    const track = $('marquee-track');
    if (track) track.innerHTML += track.innerHTML; // two copies scroll seamlessly to -50%
  }

  /* ---------- self-typing demo ---------- */

  function createDemo(isActive) {
    const textEl = $('demo-text');
    const wpmEl = $('demo-wpm');
    const accEl = $('demo-acc');
    const line = $('demo-line');
    const area = $('demo-area');
    if (!textEl) return { start() {}, stop() {} };

    let timer = null;
    let lineIndex = 0;
    let typed = [];         // { ch, ok }
    let pendingFix = false;
    let startAt = 0;
    let keys = 0;
    let errors = 0;
    let history = [];

    function render(target) {
      const done = typed.map((t) => `<span class="${t.ok ? 'ok' : 'bad'}">${t.ch === ' ' && !t.ok ? '_' : t.ch}</span>`).join('');
      textEl.innerHTML = `${done}<span class="demo-caret"></span>${target.slice(typed.length)}`;
    }

    function spark() {
      const max = Math.max(60, ...history) * 1.15;
      const pts = history.map((v, i) => [(i / (SPARK_POINTS - 1)) * 300, 58 - (v / max) * 52]);
      if (pts.length < 2) return;
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      line.setAttribute('d', d);
      area.setAttribute('d', `${d} L${pts[pts.length - 1][0].toFixed(1)} 60 L0 60 Z`);
    }

    function stats() {
      const minutes = (performance.now() - startAt) / 60000;
      const correct = typed.filter((t) => t.ok).length;
      const wpm = minutes > 0 ? Math.round(correct / 5 / minutes) : 0;
      accEl.textContent = String(keys ? Math.round(((keys - errors) / keys) * 100) : 100);
      // The first few keys give a meaningless spike, so wait for a short run.
      if (typed.length < 10) return;
      wpmEl.textContent = String(Math.min(wpm, 199));
      history = [...history, wpm].slice(-SPARK_POINTS);
      spark();
    }

    function step() {
      if (!isActive()) {
        timer = setTimeout(step, 400);
        return;
      }
      const target = DEMO_LINES[lineIndex];
      if (typed.length === 0 && !startAt) startAt = performance.now();

      if (pendingFix) {
        typed = typed.slice(0, -1);
        pendingFix = false;
      } else if (typed.length >= target.length) {
        timer = setTimeout(() => {
          lineIndex = (lineIndex + 1) % DEMO_LINES.length;
          typed = [];
          startAt = performance.now();
          keys = 0;
          errors = 0;
          step();
        }, DEMO_LINE_PAUSE);
        return;
      } else if (Math.random() < DEMO_TYPO_CHANCE && target[typed.length] !== ' ') {
        typed = [...typed, { ch: 'qwertyuiopasdfghjklzxcvbnm'[Math.floor(Math.random() * 26)], ok: false }];
        keys += 1;
        errors += 1;
        pendingFix = true;
      } else {
        typed = [...typed, { ch: target[typed.length], ok: true }];
        keys += 1;
      }
      render(target);
      stats();
      const jitter = DEMO_BASE_DELAY * (0.55 + Math.random() * 0.9);
      timer = setTimeout(step, pendingFix ? jitter * 3 : jitter);
    }

    return {
      start() { if (!timer) step(); },
      stop() { clearTimeout(timer); timer = null; },
    };
  }

  /* ---------- count-up stats ---------- */

  function countUp(el) {
    const to = Number(el.dataset.count);
    const t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / COUNT_MS);
      el.textContent = String(Math.round(to * (1 - Math.pow(1 - t, 4))));
      if (t < 1) root.requestAnimationFrame(frame);
    }
    root.requestAnimationFrame(frame);
  }

  function onceVisible(el, fn, threshold) {
    if (!el) return;
    if (!('IntersectionObserver' in root)) {
      fn();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        fn();
      }
    }, { threshold: threshold || 0.3 });
    io.observe(el);
  }

  /* ---------- keycaps ---------- */

  function initKeycaps(deps) {
    const caps = $('keycaps');
    if (!caps) return;
    // Mouse clicks already get a splash from the cursor, so only key presses add one.
    const press = (cap, fromKeyboard) => {
      cap.classList.add('down');
      deps.sound.key(false);
      const r = cap.getBoundingClientRect();
      deps.fx.burst(r.left + r.width / 2, r.top + 10, '#ffffff', 4);
      if (fromKeyboard && deps.splash) deps.splash(r.left + r.width / 2, r.top + r.height / 2);
    };
    const release = (cap) => cap.classList.remove('down');
    caps.addEventListener('pointerdown', (e) => {
      const cap = e.target.closest('.keycap');
      if (cap) press(cap);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => caps.addEventListener(type, () => {
      caps.querySelectorAll('.keycap.down').forEach(release);
    }));
    document.addEventListener('keydown', (e) => {
      if (!deps.isHome() || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const cap = caps.querySelector(`[data-cap="${CSS.escape(e.key.toLowerCase())}"]`);
      if (cap) press(cap, true);
    });
    document.addEventListener('keyup', (e) => {
      const cap = caps.querySelector(`[data-cap="${CSS.escape(e.key.toLowerCase())}"]`);
      if (cap) release(cap);
    });
  }

  /**
   * @param {{isHome:()=>boolean, sound:object, fx:object, ranks:object, splash?:Function}} deps
   */
  function init(deps) {
    initMarquee();
    const emblem = $('feature-emblem');
    if (emblem) emblem.innerHTML = deps.ranks.badgeSVG(12, 0, { animated: true });

    const demo = createDemo(deps.isHome);
    const demoCard = document.querySelector('.demo-card');
    if (demoCard && 'IntersectionObserver' in root) {
      new IntersectionObserver((entries) => {
        entries.forEach((e) => (e.isIntersecting ? demo.start() : demo.stop()));
      }, { threshold: 0.2 }).observe(demoCard);
    } else {
      demo.start();
    }

    const band = document.querySelector('.stats-band');
    onceVisible(band, () => band.querySelectorAll('[data-count]').forEach(countUp), 0.4);
    initKeycaps(deps);
  }

  root.TT = Object.assign(root.TT || {}, { home: { init } });
})(typeof window !== 'undefined' ? window : globalThis);
