/* Synthesised sound effects (Web Audio). No audio files needed. */
(function (root) {
  'use strict';

  const PACKS = ['thock', 'click', 'bubble', 'typewriter', 'pop', 'off'];
  const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let pack = 'thock';
  let volume = 0.6;

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AudioCtor = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      ctx = new AudioCtor();
    } catch (err) {
      console.warn('Audio unavailable:', err);
      return null;
    }
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function jitter(amount) {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  function envelope(gainNode, t, peak, attack, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  function noise(t, opts) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type || 'bandpass';
    filter.frequency.value = opts.freq;
    filter.Q.value = opts.q || 1;
    const g = ctx.createGain();
    envelope(g, t, opts.peak, opts.attack || 0.002, opts.decay);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.3);
    src.stop(t + (opts.attack || 0.002) + opts.decay + 0.05);
  }

  function tone(t, opts) {
    const osc = ctx.createOscillator();
    osc.type = opts.wave || 'sine';
    osc.frequency.setValueAtTime(opts.from, t);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + opts.decay);
    const g = ctx.createGain();
    envelope(g, t, opts.peak, opts.attack || 0.003, opts.decay);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + (opts.attack || 0.003) + opts.decay + 0.05);
  }

  const KEY_SOUNDS = {
    thock(t, heavy) {
      const j = jitter(0.06);
      tone(t, { from: (heavy ? 95 : 140) * j, to: 60, peak: 0.5, decay: heavy ? 0.12 : 0.08 });
      noise(t, { type: 'lowpass', freq: 1400 * j, peak: 0.35, decay: 0.04 });
    },
    click(t, heavy) {
      const j = jitter(0.08);
      noise(t, { type: 'highpass', freq: 3500 * j, peak: 0.4, decay: 0.018 });
      tone(t, { from: (heavy ? 1400 : 2200) * j, peak: 0.12, decay: 0.02, wave: 'square' });
    },
    bubble(t, heavy) {
      const j = jitter(0.1);
      tone(t, { from: (heavy ? 260 : 420) * j, to: (heavy ? 520 : 980) * j, peak: 0.35, decay: 0.07 });
    },
    typewriter(t, heavy) {
      const j = jitter(0.07);
      noise(t, { type: 'bandpass', freq: 2600 * j, q: 2, peak: 0.6, decay: 0.03 });
      tone(t, { from: 180 * j, to: 90, peak: 0.25, decay: 0.05, wave: 'triangle' });
      if (heavy) noise(t + 0.02, { type: 'bandpass', freq: 900, peak: 0.3, decay: 0.08 });
    },
    pop(t, heavy) {
      const j = jitter(0.12);
      tone(t, { from: (heavy ? 600 : 900) * j, to: 200, peak: 0.3, decay: 0.05, wave: 'triangle' });
    },
  };

  function run(fn) {
    if (pack === 'off' || volume <= 0) return;
    if (!ensureContext()) return;
    try {
      fn(ctx.currentTime + 0.001);
    } catch (err) {
      console.warn('Sound error:', err);
    }
  }

  function semitone(base, steps) {
    return base * Math.pow(2, steps / 12);
  }

  const api = {
    PACKS,
    unlock() { ensureContext(); },
    setPack(name) { if (PACKS.includes(name)) pack = name; },
    getPack() { return pack; },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.value = volume;
    },
    getVolume() { return volume; },
    key(heavy) { run((t) => (KEY_SOUNDS[pack] || KEY_SOUNDS.thock)(t, heavy)); },
    error() {
      run((t) => {
        tone(t, { from: 140, to: 90, peak: 0.25, decay: 0.12, wave: 'sawtooth' });
        tone(t, { from: 147, to: 95, peak: 0.18, decay: 0.12, wave: 'sawtooth' });
      });
    },
    /** Rising chime whose pitch climbs with the combo level. */
    combo(level) {
      run((t) => {
        const step = PENTATONIC[Math.min(PENTATONIC.length - 1, level)];
        tone(t, { from: semitone(523, step), peak: 0.2, decay: 0.25, wave: 'triangle' });
        tone(t + 0.06, { from: semitone(523, step + 7), peak: 0.14, decay: 0.3 });
      });
    },
    uiHover() { run((t) => tone(t, { from: 1800, peak: 0.04, decay: 0.03 })); },
    uiClick() {
      run((t) => {
        tone(t, { from: 520, to: 880, peak: 0.18, decay: 0.06, wave: 'triangle' });
        noise(t, { type: 'highpass', freq: 4000, peak: 0.12, decay: 0.015 });
      });
    },
    start() {
      run((t) => [0, 4, 7].forEach((s, i) => tone(t + i * 0.05, { from: semitone(392, s), peak: 0.16, decay: 0.15, wave: 'triangle' })));
    },
    finish() {
      run((t) => [0, 4, 7, 12, 16].forEach((s, i) => tone(t + i * 0.08, { from: semitone(523, s), peak: 0.18, decay: 0.35, wave: 'triangle' })));
    },
    tick() { run((t) => tone(t, { from: 1200, peak: 0.08, decay: 0.04, wave: 'square' })); },
    rpGain() { run((t) => tone(t, { from: 1500 * jitter(0.05), peak: 0.05, decay: 0.03, wave: 'triangle' })); },
    rankUp() {
      run((t) => {
        [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => {
          tone(t + i * 0.07, { from: semitone(392, s), peak: 0.2, decay: 0.4, wave: 'triangle' });
          tone(t + i * 0.07, { from: semitone(392, s + 12), peak: 0.06, decay: 0.3 });
        });
        noise(t + 0.6, { type: 'highpass', freq: 6000, peak: 0.15, decay: 0.8 });
      });
    },
    rankDown() {
      run((t) => [7, 4, 0].forEach((s, i) => tone(t + i * 0.12, { from: semitone(262, s), peak: 0.15, decay: 0.25, wave: 'triangle' })));
    },
  };

  root.TT = Object.assign(root.TT || {}, { sound: api });
})(typeof window !== 'undefined' ? window : globalThis);
