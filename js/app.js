/* App wiring: settings, navigation, input, effects and results flow. */
(function (root) {
  'use strict';

  const { ranks: Ranks, sound: Sound, fx: Fx, storage: Storage, views: Views, levels: Levels } = root.TT;
  const $ = (id) => document.getElementById(id);

  const AMOUNTS = { time: [15, 30, 60, 120], words: [10, 25, 50, 100] };
  const THEMES = ['nebula', 'dusk', 'midnight', 'dawn', 'aurora'];
  const LANDSCAPE_FREE_THEMES = ['nebula']; // themes drawn in CSS, without the WebGL landscape
  const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const SCROLLED_AT = 24;

  let profile = Storage.load();
  let activeView = 'home';
  let lastPayload = null;
  let resultsBusy = false;
  let water = null; // WebGL landscape renderer
  let splashCursor = null; // React Bits SplashCursor (vanilla port)
  let difficulty = null; // landing page level picker
  let challenge = null; // { level, index, config } while playing a level test
  let lastPassed = false;

  const typingArea = $('typing-area');
  const hiddenInput = $('hidden-input');

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function accentColors() {
    return [cssVar('--accent'), cssVar('--accent-2')];
  }

  function persist(next) {
    profile = next;
    Storage.save(profile);
  }

  function updateSettings(patch) {
    persist(Storage.withSettings(profile, patch));
    applySettings();
  }

  function splash(x, y) {
    if (splashCursor) splashCursor.splash(x, y);
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---------- settings UI ---------- */

  function renderAmounts() {
    const s = profile.settings;
    $('amounts').innerHTML = AMOUNTS[s.mode]
      .map((n) => `<button class="pill btn ${n === s.amount ? 'on' : ''}" data-amount="${n}" type="button">${n}</button>`)
      .join('');
  }

  function applySettings() {
    const s = profile.settings;
    const theme = THEMES.includes(s.theme) ? s.theme : THEMES[0];
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-toggle]').forEach((b) => b.classList.toggle('on', Boolean(s[b.dataset.toggle])));
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.mode));
    renderAmounts();
    $('sound-btn').textContent = s.sound;
    $('theme-btn').textContent = theme;
    $('volume').value = String(s.volume);
    $('keyboard').classList.toggle('hidden', !s.keyboard);
    Sound.setPack(s.sound);
    Sound.setVolume(s.volume);
    const landscape = !LANDSCAPE_FREE_THEMES.includes(theme);
    if (water) {
      water.setEnabled(landscape);
      if (landscape) water.refreshTheme();
    }
    // The cursor ink is a single colour taken from the theme.
    if (splashCursor) splashCursor.update({ rainbow: false, colors: [cssVar('--splash')] });
  }

  function testConfig() {
    if (challenge) {
      const c = challenge.config;
      return {
        mode: c.mode, amount: c.amount, punctuation: c.punctuation, numbers: c.numbers,
        minLength: c.minLength, maxLength: c.maxLength,
      };
    }
    const s = profile.settings;
    return { mode: s.mode, amount: s.amount, punctuation: s.punctuation, numbers: s.numbers, minLength: null, maxLength: null };
  }

  /* ---------- level challenges ---------- */

  function renderChallengeBar() {
    const bar = $('challenge-bar');
    document.body.classList.toggle('in-challenge', Boolean(challenge));
    bar.hidden = !challenge;
    if (!challenge) return;
    const { level, index, config } = challenge;
    const tier = Ranks.TIERS[level];
    $('challenge-badge').innerHTML = Ranks.badgeSVG(level, level === Ranks.TIERS.length - 1 ? 0 : 1, { animated: true });
    $('challenge-kicker').textContent = `Level ${level + 1} · ${tier.name}`;
    $('challenge-title').textContent = `Test ${index + 1} of ${Levels.TESTS_PER_LEVEL}`;
    $('challenge-wpm').textContent = String(config.targetWpm);
    $('challenge-acc').textContent = String(config.minAcc);
    bar.style.setProperty('--tier', tier.base);
  }

  function startLevel(level, index) {
    challenge = { level, index, config: Levels.testConfig(level, index) };
    lastPassed = false;
    renderChallengeBar();
    newTest();
    showView('type');
  }

  function exitChallenge() {
    challenge = null;
    renderChallengeBar();
    restart();
  }

  /** After a passed test, the next one; after the last test of a level, the next level. */
  function advance() {
    if (challenge && lastPassed) {
      const { level, index } = challenge;
      if (index < Levels.TESTS_PER_LEVEL - 1) startLevel(level, index + 1);
      else if (level < Levels.LEVEL_COUNT - 1) startLevel(level + 1, 0);
      else startLevel(level, index);
      focusTyping();
      return;
    }
    restart();
  }

  /* ---------- live UI ---------- */

  function bump(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function setTyping(active) {
    document.body.classList.toggle('typing-active', active);
    if (water) water.setQuiet(active);
  }

  function resetLive() {
    const c = testConfig();
    $('live-counter').textContent = c.mode === 'time' ? String(c.amount) : `0/${c.amount}`;
    $('live-counter').classList.remove('danger');
    $('live-wpm').textContent = '0';
    $('live-acc').textContent = '100';
    setTyping(false);
  }

  /* ---------- engine ---------- */

  const test = root.TT.createTypingTest({ words: $('words'), caret: $('caret') }, {
    onStart() {
      setTyping(true);
      Sound.start();
    },
    onTick(remaining) {
      const el = $('live-counter');
      el.textContent = String(Math.max(0, remaining));
      bump(el, 'pulse');
      if (remaining <= 5 && remaining > 0) {
        el.classList.add('danger');
        Sound.tick();
      }
    },
    onLive({ wpm, acc }) {
      $('live-wpm').textContent = String(wpm);
      $('live-acc').textContent = String(acc);
      const c = testConfig();
      if (c.mode === 'words') $('live-counter').textContent = `${test.progress().current}/${c.amount}`;
    },
    onCorrect(pos, isSpace) {
      Sound.key(isSpace);
      if (isSpace) Fx.burst(pos.x, pos.y, '#ffffff', 2);
      highlightNextKey();
    },
    onError() {
      Sound.error();
      bump(typingArea, 'flash-error');
      highlightNextKey();
    },
    onComboChange(count, level, fraction) {
      $('combo-count').textContent = String(count);
      $('combo-mult').textContent = `x${level + 1}`;
      $('combo-fill').style.width = `${Math.round(fraction * 100)}%`;
      $('combo').classList.toggle('hot', level >= 2);
      typingArea.classList.toggle('combo-hot', level >= 2);
    },
    onComboLevel(level) {
      Sound.combo(level);
      bump($('combo'), 'bump');
      const c = centerOf($('combo'));
      Fx.floatText(c.x, c.y - 26, `x${level + 1} flow`, level >= 3 ? 'big' : '');
    },
    onComboBreak(count) {
      bump($('combo'), 'broken');
      const c = centerOf($('combo'));
      Fx.floatText(c.x, c.y - 26, `${count} combo lost`, 'bad');
    },
    onFinish(payload) {
      handleFinish(payload);
    },
  });

  function newTest(sameWords) {
    test.reset(testConfig(), sameWords);
    resetLive();
    hiddenInput.value = '';
    highlightNextKey();
  }

  function restart(sameWords) {
    if (resultsBusy) return;
    newTest(sameWords);
    if (activeView !== 'type') showView('type');
    focusTyping();
  }

  async function handleFinish(payload) {
    lastPayload = payload;
    setTyping(false);
    const { result, config } = payload;
    const rpBefore = profile.rp;
    const delta = Ranks.ratingDelta(result, rpBefore);
    const bestKey = `${config.mode}-${config.amount}`;
    const isPb = result.wpm > 0 && result.wpm > (profile.best[bestKey] || 0) && profile.history.length > 0;
    persist(Storage.withResult(profile, {
      wpm: result.wpm, raw: result.raw, acc: result.accuracy, cons: result.consistency,
      mode: config.mode, amount: config.amount, delta, ts: Date.now(),
    }));
    const levelOutcome = challenge ? recordLevel(result) : null;

    Sound.finish();
    showView('results');
    Views.renderLevelResult(levelOutcome);
    if (levelOutcome && levelOutcome.passed) {
      const tier = Ranks.TIERS[levelOutcome.level];
      Fx.confetti([tier.light, tier.base, '#ffffff'], levelOutcome.levelDone ? 140 : 60);
      splash(root.innerWidth / 2, root.innerHeight * 0.35);
    }
    if (isPb) Fx.confetti([...accentColors(), '#ffffff'], 70);
    resultsBusy = true;
    try {
      const change = await Views.renderResults(payload, rpBefore, delta, isPb);
      Views.renderChip(profile.rp);
      if (change) celebrate(change);
    } catch (err) {
      console.error('Failed to show results:', err);
    } finally {
      resultsBusy = false;
    }
  }

  /** Saves level progress for the finished challenge test and describes the outcome. */
  function recordLevel(result) {
    const { level, index, config } = challenge;
    const passed = Levels.passes(config, result);
    const before = Levels.cleared(profile.levels, level);
    persist(Storage.withLevels(profile, Levels.withResult(profile.levels, level, index, passed)));
    const after = Levels.cleared(profile.levels, level);
    lastPassed = passed;
    return {
      level, index, config, result, passed, cleared: after,
      newlyCleared: after > before,
      levelDone: after === Levels.TESTS_PER_LEVEL && before < Levels.TESTS_PER_LEVEL,
      isLast: index === Levels.TESTS_PER_LEVEL - 1,
    };
  }

  function celebrate(change) {
    if (change.up) {
      Sound.rankUp();
      Fx.confetti([change.rank.tier.light, change.rank.tier.base, '#ffffff'], 120);
      splash(root.innerWidth / 2, root.innerHeight * 0.42);
      Views.showOverlay(change.rank, 'rank up', false);
    } else {
      Sound.rankDown();
      Views.showOverlay(change.rank, 'rank lost', true);
    }
  }

  /* ---------- views ---------- */

  function showView(name) {
    const changed = name !== activeView;
    activeView = name;
    document.body.classList.toggle('on-home', name === 'home');
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    document.querySelectorAll('.nav-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === name || (name === 'results' && b.dataset.view === 'type'));
    });
    if (changed) root.scrollTo({ top: 0, behavior: 'instant' });
    if (name === 'home' && difficulty) difficulty.refresh();
    if (name === 'ranks') Views.renderRanks(profile.rp);
    if (name === 'profile') Views.renderProfile(profile);
    if (name === 'type') {
      requestAnimationFrame(() => test.moveCaret());
      focusTyping();
    }
    if (name !== 'type') setTyping(false);
  }

  /* ---------- keyboard visual ---------- */

  function buildKeyboard() {
    const rows = KEY_ROWS.map((row) => `<div class="kb-row">${[...row].map((k) => `<div class="key" data-key="${k}">${k}</div>`).join('')}</div>`);
    rows.push('<div class="kb-row"><div class="key wide" data-key=" ">space</div></div>');
    $('keyboard').innerHTML = rows.join('');
  }

  function keyEl(key) {
    return $('keyboard').querySelector(`[data-key="${CSS.escape(key === ' ' ? ' ' : key.toLowerCase())}"]`);
  }

  function highlightNextKey() {
    document.querySelectorAll('.key.next').forEach((k) => k.classList.remove('next'));
    const el = keyEl(test.expectedKey());
    if (el) el.classList.add('next');
  }

  function pressKey(key, wrong) {
    const el = keyEl(key);
    if (!el) return;
    el.classList.add('pressed');
    if (wrong) el.classList.add('wrong');
  }

  function releaseKey(key) {
    const el = keyEl(key);
    if (el) el.classList.remove('pressed', 'wrong');
  }

  /* ---------- focus ---------- */

  function focusTyping() {
    if (activeView !== 'type') return;
    hiddenInput.focus({ preventScroll: true });
    typingArea.classList.remove('blurred');
  }

  /* ---------- input ---------- */

  function onKeyDown(e) {
    Sound.unlock();
    if ($('overlay').classList.contains('show')) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        Views.hideOverlay();
      }
      return;
    }
    if (e.key === 'Tab' || e.key === 'Escape') {
      if (activeView === 'results' && e.key === 'Tab') {
        e.preventDefault();
        if (!resultsBusy) advance();
      } else if (activeView === 'type' || activeView === 'results') {
        e.preventDefault();
        restart();
      }
      return;
    }
    if (activeView !== 'type') return;
    const target = e.target;
    if (target && target !== hiddenInput && (target.tagName === 'INPUT' || target.tagName === 'BUTTON') && e.key === ' ') return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) focusTyping();
    const expected = test.expectedKey();
    if (test.handleKey(e)) {
      e.preventDefault();
      if (e.key.length === 1) pressKey(e.key, e.key !== expected);
    }
  }

  // Mobile keyboards often report "Unidentified" on keydown; read the input instead.
  function onMobileInput(e) {
    if (activeView !== 'type') return;
    if (e.inputType === 'deleteContentBackward') {
      test.backspace(false);
    } else if (e.data) {
      [...e.data].forEach((ch) => (ch === ' ' ? test.handleKey({ key: ' ' }) : test.typeChar(ch)));
    }
    hiddenInput.value = '';
  }

  /* ---------- premium touches ---------- */

  /** Glass surfaces get a soft highlight that follows the pointer. */
  function bindSheen() {
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest && e.target.closest('.glass, .btn');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });
  }

  function bindReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in root)) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
  }

  function bindScroll() {
    const bar = document.querySelector('.topbar');
    root.addEventListener('scroll', () => bar.classList.toggle('scrolled', root.scrollY > SCROLLED_AT), { passive: true });
  }

  /** SVG refraction inside backdrop-filter only renders in Chromium. */
  function enableRefraction() {
    if (root.TT.perf && root.TT.perf.lite) return; // the SVG refraction filter is too heavy for phones
    const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
    if (brands.some((b) => /Chromium/i.test(b.brand))) document.documentElement.classList.add('refract');
  }

  /* ---------- events ---------- */

  function bindClicks() {
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.btn');
      if (btn) {
        Sound.unlock();
        Fx.ripple(e, btn);
      }
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('.btn, .rail-item')) Sound.uiClick();
    });
    document.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('.btn');
      if (btn && !btn.contains(e.relatedTarget)) Sound.uiHover();
    });

    document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      // Plain "start typing" links always open free mode.
      if (b.dataset.view === 'type' && challenge) {
        challenge = null;
        renderChallengeBar();
        newTest();
      } else if (b.dataset.view === 'type' && activeView !== 'type') newTest();
      showView(b.dataset.view);
    }));
    document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      const key = b.dataset.toggle;
      updateSettings({ [key]: !profile.settings[key] });
      if (key !== 'keyboard') restart();
    }));
    document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      updateSettings({ mode, amount: AMOUNTS[mode][1] });
      restart();
    }));
    $('amounts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-amount]');
      if (!b) return;
      updateSettings({ amount: Number(b.dataset.amount) });
      restart();
    });
    $('sound-btn').addEventListener('click', () => {
      const packs = Sound.PACKS;
      updateSettings({ sound: packs[(packs.indexOf(profile.settings.sound) + 1) % packs.length] });
      Sound.key(false);
    });
    $('volume').addEventListener('input', (e) => updateSettings({ volume: Number(e.target.value) }));
    $('volume').addEventListener('change', () => Sound.key(false));
    $('theme-btn').addEventListener('click', () => {
      const current = THEMES.indexOf(document.documentElement.dataset.theme);
      updateSettings({ theme: THEMES[(current + 1) % THEMES.length] });
      const c = centerOf($('theme-btn'));
      splash(c.x, c.y);
    });
    $('restart').addEventListener('click', () => restart());
    $('next-test').addEventListener('click', () => { if (!resultsBusy) advance(); });
    $('challenge-exit').addEventListener('click', exitChallenge);
    $('retry-test').addEventListener('click', () => restart(lastPayload ? lastPayload.targets : null));
    $('overlay-close').addEventListener('click', Views.hideOverlay);
    $('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') Views.hideOverlay(); });
    const preview = (e) => {
      const b = e.target.closest('[data-tier]');
      if (b) Views.previewBadge(Number(b.dataset.tier), Number(b.dataset.div));
    };
    $('rank-grid').addEventListener('click', preview);
    $('badge-rail').addEventListener('click', preview);
    $('hero-badge').addEventListener('click', () => {
      const rank = Ranks.getRank(profile.rp);
      Fx.confetti([rank.tier.light, rank.tier.base, '#ffffff'], 60);
      Views.showOverlay(rank, 'your rank', false);
    });
    $('reset-profile').addEventListener('click', () => {
      // eslint-disable-next-line no-alert
      if (!root.confirm('Reset all tests, personal bests and rank? This cannot be undone.')) return;
      persist(Storage.reset());
      applySettings();
      Views.renderChip(profile.rp);
      Views.renderProfile(profile);
    });
    typingArea.addEventListener('click', focusTyping);
  }

  function init() {
    root.TT.scene.init();
    water = root.TT.trail.init($('scene-gl'), null, { paint: false });
    const lite = Boolean(root.TT.perf && root.TT.perf.lite);
    // On touch screens every tap and scroll would splash ink, which gets in the way, so phones go without.
    const touchOnly = root.matchMedia('(hover: none) and (pointer: coarse)').matches;
    splashCursor = touchOnly ? null : root.TT.createSplashCursor({
      quality: lite ? 'low' : 'high', // phones get a coarser, much cheaper fluid simulation
      rainbow: false,
      colors: [cssVar('--splash') || '#a78bfa'],
      size: 1,
      force: 1,
      swirl: 3,
      trail: 1,
      clickSplash: true,
    });
    Fx.init($('fx-canvas'));
    enableRefraction();
    buildKeyboard();
    applySettings();
    Views.renderChip(profile.rp);
    Views.renderRail($('badge-rail'));
    root.TT.home.init({
      isHome: () => activeView === 'home',
      sound: Sound,
      fx: Fx,
      ranks: Ranks,
      splash: (x, y) => splash(x, y),
    });
    difficulty = root.TT.difficulty.init({
      ranks: Ranks,
      levels: Levels,
      sound: Sound,
      getProgress: () => profile.levels,
      startTest: startLevel,
    });
    bindClicks();
    bindSheen();
    bindReveal();
    bindScroll();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', (e) => releaseKey(e.key));
    hiddenInput.addEventListener('input', onMobileInput);
    hiddenInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== hiddenInput && activeView === 'type') typingArea.classList.add('blurred');
      }, 150);
    });
    root.addEventListener('resize', () => test.moveCaret());
    if (document.fonts) document.fonts.ready.then(() => test.moveCaret());
    newTest();
    showView('home');
  }

  init();
})(window);
