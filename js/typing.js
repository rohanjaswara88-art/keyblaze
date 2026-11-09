/* Typing test engine: input handling, word rendering, caret, combo, timing. */
(function (root) {
  'use strict';

  const { words: Words, stats: Stats } = root.TT;
  const TICK_MS = 100;
  const COMBO_STEP = 20;
  const MAX_COMBO_LEVEL = 9;
  const TIME_MODE_BATCH = 80;
  const TIME_MODE_REFILL_AT = 30;
  const MIN_PARTIAL_SECOND_MS = 300;

  /**
   * @param {{words:HTMLElement, caret:HTMLElement}} dom
   * @param {Object<string, Function>} on event callbacks
   */
  function createTypingTest(dom, on) {
    let config = { mode: 'time', amount: 30, punctuation: false, numbers: false };
    let targets = [];
    let typed = [''];
    let current = 0;
    let started = false;
    let finished = false;
    let startTime = 0;
    let ticker = null;
    let secondsRecorded = 0;
    let keystrokes = { correct: 0, total: 0 };
    let secondBucket = { chars: 0, errors: 0 };
    let series = { wpm: [], raw: [], errors: [] };
    let combo = 0;
    let wordEls = [];

    const emit = (name, ...args) => { if (on[name]) on[name](...args); };

    /* ---------- rendering ---------- */

    function buildWordEl(word) {
      const el = document.createElement('div');
      el.className = 'word';
      for (const ch of word) {
        const span = document.createElement('span');
        span.className = 'letter';
        span.textContent = ch;
        el.appendChild(span);
      }
      return el;
    }

    function appendWords(list) {
      const frag = document.createDocumentFragment();
      list.forEach((w) => {
        const el = buildWordEl(w);
        wordEls.push(el);
        frag.appendChild(el);
      });
      dom.words.insertBefore(frag, dom.caret);
    }

    function renderAll() {
      dom.words.innerHTML = '';
      dom.words.appendChild(dom.caret);
      dom.words.style.transform = 'translateY(0)';
      wordEls = [];
      appendWords(targets);
      requestAnimationFrame(moveCaret);
    }

    function caretPoint() {
      const wordEl = wordEls[current];
      if (!wordEl) return null;
      const letters = wordEl.children;
      const index = typed[current].length;
      let x;
      if (index < letters.length) {
        x = wordEl.offsetLeft + letters[index].offsetLeft;
      } else {
        const last = letters[letters.length - 1];
        x = wordEl.offsetLeft + (last ? last.offsetLeft + last.offsetWidth : 0);
      }
      return { x, y: wordEl.offsetTop, lineHeight: wordEl.offsetHeight };
    }

    function moveCaret() {
      const p = caretPoint();
      if (!p) return;
      const caretH = dom.caret.offsetHeight;
      dom.caret.style.left = `${p.x - 1}px`;
      dom.caret.style.top = `${p.y + (p.lineHeight - caretH) / 2}px`;
      // Keep the active line as the second visible line.
      const shift = Math.max(0, p.y - p.lineHeight);
      dom.words.style.transform = `translateY(${-shift}px)`;
    }

    /** Screen coordinates of the caret, used to spawn particles. */
    function caretScreenPos() {
      const r = dom.caret.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    /* ---------- timing ---------- */

    function elapsed() {
      return started ? performance.now() - startTime : 0;
    }

    function cumulativeWpm(ms) {
      const chars = Stats.countChars(targets, typed.slice(0, current + 1));
      return Stats.wpmFromChars(chars.correctWordChars, ms);
    }

    function recordSecond(durationMs) {
      const scale = 1000 / durationMs;
      series = {
        wpm: [...series.wpm, cumulativeWpm(elapsed())],
        raw: [...series.raw, secondBucket.chars * 12 * scale],
        errors: [...series.errors, secondBucket.errors],
      };
      secondBucket = { chars: 0, errors: 0 };
    }

    function tick() {
      const ms = elapsed();
      while (Math.floor(ms / 1000) > secondsRecorded) {
        recordSecond(1000);
        secondsRecorded += 1;
        if (config.mode === 'time') emit('onTick', config.amount - secondsRecorded);
      }
      emit('onLive', {
        wpm: Math.round(cumulativeWpm(ms)),
        acc: Math.round(Stats.accuracy(keystrokes.correct, keystrokes.total)),
      });
      if (config.mode === 'time' && ms >= config.amount * 1000) finish();
    }

    function start() {
      started = true;
      startTime = performance.now();
      ticker = setInterval(tick, TICK_MS);
      emit('onStart');
    }

    function stopTicker() {
      if (ticker) clearInterval(ticker);
      ticker = null;
    }

    function finish() {
      if (finished) return;
      finished = true;
      stopTicker();
      const total = config.mode === 'time' ? config.amount * 1000 : elapsed();
      const leftover = total - secondsRecorded * 1000;
      if (leftover >= MIN_PARTIAL_SECOND_MS || series.raw.length === 0) recordSecond(Math.max(leftover, 1));
      const typedWords = typed.slice(0, current + 1);
      const result = Stats.computeResult({
        targetWords: targets,
        typedWords,
        elapsedMs: total,
        correctKeystrokes: keystrokes.correct,
        totalKeystrokes: keystrokes.total,
        rawSamples: series.raw,
      });
      emit('onFinish', { result, series, config: { ...config }, targets: targets.slice(0, current + 1) });
    }

    /* ---------- combo ---------- */

    function comboHit() {
      const before = Math.floor(combo / COMBO_STEP);
      combo += 1;
      const after = Math.floor(combo / COMBO_STEP);
      emit('onComboChange', combo, Math.min(MAX_COMBO_LEVEL, after), (combo % COMBO_STEP) / COMBO_STEP);
      if (after > before) emit('onComboLevel', Math.min(MAX_COMBO_LEVEL, after));
    }

    function comboBreak() {
      if (combo >= 10) emit('onComboBreak', combo);
      combo = 0;
      emit('onComboChange', 0, 0, 0);
    }

    /* ---------- input ---------- */

    function typeChar(ch) {
      if (finished) return;
      if (!started) start();
      const target = targets[current];
      const index = typed[current].length;
      // Cap extra letters so the line layout doesn't explode.
      if (index >= target.length + 10) return;
      typed = typed.map((t, i) => (i === current ? t + ch : t));
      const wordEl = wordEls[current];
      const correct = index < target.length && target[index] === ch;

      if (index < target.length) {
        wordEl.children[index].classList.add(correct ? 'correct' : 'incorrect');
      } else {
        const extra = document.createElement('span');
        extra.className = 'letter extra';
        extra.textContent = ch;
        wordEl.appendChild(extra);
      }
      keystrokes = { correct: keystrokes.correct + (correct ? 1 : 0), total: keystrokes.total + 1 };
      secondBucket = { chars: secondBucket.chars + 1, errors: secondBucket.errors + (correct ? 0 : 1) };
      moveCaret();

      if (correct) {
        comboHit();
        emit('onCorrect', caretScreenPos(), false);
      } else {
        comboBreak();
        emit('onError', ch);
      }

      const isLastWord = current === targets.length - 1;
      if (config.mode === 'words' && isLastWord && typed[current] === target) finish();
    }

    function commitWord() {
      if (finished) return;
      if (!started || typed[current].length === 0) return;
      const target = targets[current];
      const correct = typed[current] === target;
      const wordEl = wordEls[current];
      wordEl.classList.add('done');
      if (!correct) wordEl.classList.add('error');
      keystrokes = { correct: keystrokes.correct + (correct ? 1 : 0), total: keystrokes.total + 1 };
      secondBucket = { chars: secondBucket.chars + 1, errors: secondBucket.errors + (correct ? 0 : 1) };

      if (correct) {
        comboHit();
      } else {
        comboBreak();
        emit('onError', ' ');
      }

      if (current === targets.length - 1) {
        finish();
        return;
      }
      current += 1;
      typed = [...typed, ''];
      if (config.mode === 'time' && targets.length - current < TIME_MODE_REFILL_AT) {
        const more = Words.generateWords(TIME_MODE_BATCH, config);
        targets = [...targets, ...more];
        appendWords(more);
      }
      moveCaret();
      emit('onCorrect', caretScreenPos(), true);
    }

    function backspace(wholeWord) {
      if (finished || !started) return;
      if (typed[current].length === 0) {
        // Allow going back only into a word that has a mistake.
        if (current === 0 || typed[current - 1] === targets[current - 1]) return;
        typed = typed.slice(0, current);
        current -= 1;
        wordEls[current].classList.remove('done', 'error');
        if (!wholeWord) {
          moveCaret();
          return;
        }
      }
      const wordEl = wordEls[current];
      const target = targets[current];
      const newLength = wholeWord ? 0 : typed[current].length - 1;
      for (let i = typed[current].length - 1; i >= newLength; i -= 1) {
        if (i >= target.length) {
          wordEl.lastChild.remove();
        } else {
          wordEl.children[i].classList.remove('correct', 'incorrect');
        }
      }
      typed = typed.map((t, i) => (i === current ? t.slice(0, newLength) : t));
      moveCaret();
    }

    /** Handles a keyboard event. Returns true when the event was consumed. */
    function handleKey(e) {
      if (finished) return false;
      if (e.key === 'Backspace') {
        backspace(e.ctrlKey || e.altKey || e.metaKey);
        return true;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (e.key === ' ') {
        commitWord();
        return true;
      }
      if (e.key.length === 1) {
        typeChar(e.key);
        return true;
      }
      return false;
    }

    function reset(newConfig, sameWords) {
      stopTicker();
      config = { ...config, ...newConfig };
      const count = config.mode === 'words' ? config.amount : TIME_MODE_BATCH;
      targets = sameWords && sameWords.length ? sameWords.slice() : Words.generateWords(count, config);
      typed = [''];
      current = 0;
      started = false;
      finished = false;
      secondsRecorded = 0;
      keystrokes = { correct: 0, total: 0 };
      secondBucket = { chars: 0, errors: 0 };
      series = { wpm: [], raw: [], errors: [] };
      combo = 0;
      emit('onComboChange', 0, 0, 0);
      renderAll();
    }

    /** The next character the user should press, for keyboard hints. */
    function expectedKey() {
      const target = targets[current] || '';
      const index = typed[current] ? typed[current].length : 0;
      return index < target.length ? target[index] : ' ';
    }

    return {
      reset,
      handleKey,
      typeChar,
      backspace,
      moveCaret,
      expectedKey,
      isRunning: () => started && !finished,
      wordsInProgress: () => targets.slice(),
      progress: () => ({ current, total: targets.length }),
      stop: stopTicker,
    };
  }

  root.TT = Object.assign(root.TT || {}, { createTypingTest });
})(typeof window !== 'undefined' ? window : globalThis);
