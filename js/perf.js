/*
 * Picks a performance tier before anything renders.
 * "lite" is used on phones, tablets and low-end machines: lighter fluid sim, fewer effects, cheaper glass.
 * Override with ?perf=lite or ?perf=full in the URL.
 */
(function (root) {
  'use strict';

  const LOW_CORES = 4;
  const LOW_MEMORY_GB = 4;
  const SMALL_SCREEN_PX = 820;

  function detectLite() {
    const forced = new URLSearchParams(root.location.search).get('perf');
    if (forced === 'lite') return true;
    if (forced === 'full') return false;
    const nav = root.navigator || {};
    const touchOnly = root.matchMedia && root.matchMedia('(hover: none) and (pointer: coarse)').matches;
    // The physical screen decides, not the window, so a narrow desktop window stays "full".
    // Some embedded browsers report a 0x0 screen; fall back to the window then.
    const scr = root.screen || {};
    const screenShort = scr.width > 0 && scr.height > 0 ? Math.min(scr.width, scr.height) : root.innerWidth;
    const smallScreen = screenShort < SMALL_SCREEN_PX;
    const fewCores = (nav.hardwareConcurrency || 8) <= LOW_CORES;
    const littleMemory = (nav.deviceMemory || 8) <= LOW_MEMORY_GB;
    return touchOnly || smallScreen || fewCores || littleMemory;
  }

  /** Tiny on-screen fps counter, only with ?fps in the URL, for checking real devices. */
  function showFpsMeter(mode) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;padding:6px 10px;border-radius:10px;' +
      'font:12px/1.2 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.6);pointer-events:none';
    document.body.appendChild(el);
    let frames = 0;
    let worst = 0;
    let last = performance.now();
    let windowStart = last;
    const tick = (now) => {
      frames += 1;
      worst = Math.max(worst, now - last);
      last = now;
      if (now - windowStart >= 1000) {
        el.textContent = `${Math.round((frames * 1000) / (now - windowStart))} fps · worst ${Math.round(worst)} ms · ${mode}`;
        frames = 0;
        worst = 0;
        windowStart = now;
      }
      root.requestAnimationFrame(tick);
    };
    root.requestAnimationFrame(tick);
  }

  const lite = detectLite();
  if (lite) document.documentElement.classList.add('perf-lite');
  if (new URLSearchParams(root.location.search).has('fps')) {
    document.addEventListener('DOMContentLoaded', () => showFpsMeter(lite ? 'lite' : 'full'));
  }
  root.TT = Object.assign(root.TT || {}, { perf: { lite } });
})(window);
