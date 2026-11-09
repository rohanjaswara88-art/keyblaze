/* Local profile persistence. Every access is guarded: storage can be blocked or empty. */
(function (root) {
  'use strict';

  const KEY = 'keyblaze.profile.v1';
  const MAX_HISTORY = 100;
  const THEME_VERSION = 2; // 2: the violet nebula theme became the default

  /** Profiles saved before the nebula theme switch to it once; later choices are kept. */
  function migrateSettings(settings) {
    if (settings.themeVersion >= THEME_VERSION) return settings;
    return { ...settings, theme: 'nebula', themeVersion: THEME_VERSION };
  }

  const DEFAULT_PROFILE = Object.freeze({
    rp: 0,
    history: [],
    best: {},
    levels: {},
    settings: {
      mode: 'time', amount: 30, punctuation: false, numbers: false,
      sound: 'thock', volume: 0.6, theme: 'nebula', themeVersion: THEME_VERSION, keyboard: true,
    },
  });

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULT_PROFILE);
      const parsed = JSON.parse(raw);
      return {
        rp: Number.isFinite(parsed.rp) ? Math.max(0, parsed.rp) : 0,
        history: Array.isArray(parsed.history) ? parsed.history.slice(-MAX_HISTORY) : [],
        best: parsed.best && typeof parsed.best === 'object' ? parsed.best : {},
        levels: parsed.levels && typeof parsed.levels === 'object' ? parsed.levels : {},
        settings: migrateSettings(Object.assign({}, DEFAULT_PROFILE.settings, { themeVersion: 0 }, parsed.settings || {})),
      };
    } catch (err) {
      console.warn('Could not load profile, starting fresh:', err);
      return structuredClone(DEFAULT_PROFILE);
    }
  }

  function save(profile) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(profile));
      return true;
    } catch (err) {
      console.warn('Could not save profile:', err);
      return false;
    }
  }

  /** Returns a new profile with the finished test recorded. */
  function withResult(profile, entry) {
    const bestKey = `${entry.mode}-${entry.amount}`;
    const prevBest = profile.best[bestKey] || 0;
    return {
      ...profile,
      rp: Math.max(0, profile.rp + entry.delta),
      history: [...profile.history, entry].slice(-MAX_HISTORY),
      best: entry.wpm > prevBest ? { ...profile.best, [bestKey]: entry.wpm } : profile.best,
    };
  }

  function withSettings(profile, patch) {
    return { ...profile, settings: { ...profile.settings, ...patch } };
  }

  function withLevels(profile, levels) {
    return levels === profile.levels ? profile : { ...profile, levels };
  }

  function reset() {
    return structuredClone(DEFAULT_PROFILE);
  }

  root.TT = Object.assign(root.TT || {}, { storage: { load, save, withResult, withSettings, withLevels, reset } });
})(typeof window !== 'undefined' ? window : globalThis);
