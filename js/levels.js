/* Difficulty levels: one per rank tier, ten tests each, every test harder than the last (pure logic). */
(function (root) {
  'use strict';

  // Same speed ladder as the rank tiers in ranks.js (kept here so this file stays dependency free).
  const TIER_PARS = [15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 120, 135, 150];
  const LEVEL_COUNT = TIER_PARS.length;
  const TESTS_PER_LEVEL = 10;
  const TOTAL_TESTS = LEVEL_COUNT * TESTS_PER_LEVEL;

  const FIRST_TARGET_WPM = 10;   // where the speed ramp of level 1 starts
  const MIN_WORDS = 15;
  const MAX_WORDS = 60;
  const BASE_ACCURACY = 85;
  const MAX_ACCURACY = 98;
  const PUNCTUATION_FROM = 4;    // Platinum
  const NUMBERS_FROM = 7;        // Ruby
  const SHORT_WORD_LEVELS = 3;   // Stone..Silver only use short words
  const LONG_WORD_FROM = 10;     // Obsidian and up drop the short words

  const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));

  /**
   * The settings and goals of one test.
   * @param {number} level 0-based level (rank tier)
   * @param {number} index 0-based test inside the level
   */
  function testConfig(level, index) {
    const l = clampInt(level, 0, LEVEL_COUNT - 1);
    const t = clampInt(index, 0, TESTS_PER_LEVEL - 1);
    const overall = (l * TESTS_PER_LEVEL + t) / (TOTAL_TESTS - 1);
    const from = l === 0 ? FIRST_TARGET_WPM : TIER_PARS[l - 1];
    const to = TIER_PARS[l];
    return {
      level: l,
      index: t,
      mode: 'words',
      amount: Math.round(MIN_WORDS + overall * (MAX_WORDS - MIN_WORDS)),
      punctuation: l >= PUNCTUATION_FROM,
      numbers: l >= NUMBERS_FROM,
      maxLength: l < SHORT_WORD_LEVELS ? 4 + l : null,
      minLength: l >= LONG_WORD_FROM ? l - 6 : null,
      targetWpm: Math.round(from + ((to - from) * (t + 1)) / TESTS_PER_LEVEL),
      minAcc: Math.min(MAX_ACCURACY, BASE_ACCURACY + l + Math.floor(t / 5)),
    };
  }

  /** True when a result meets both goals of the test. */
  function passes(config, result) {
    return result.wpm >= config.targetWpm && result.accuracy >= config.minAcc;
  }

  /** How many tests of a level are cleared (0..10). Progress is a plain {level: count} map. */
  function cleared(progress, level) {
    if (!progress || typeof progress !== 'object') return 0;
    return clampInt(progress[level], 0, TESTS_PER_LEVEL);
  }

  /** The test a player should take next in a level. */
  function nextTest(progress, level) {
    return Math.min(cleared(progress, level), TESTS_PER_LEVEL - 1);
  }

  /** Tests open one at a time: the next uncleared one and everything before it. */
  function isUnlocked(progress, level, index) {
    return index <= cleared(progress, level);
  }

  /** Returns new progress after a test. The same object comes back when nothing changed. */
  function withResult(progress, level, index, passed) {
    const done = cleared(progress, level);
    if (!passed || index !== done || done >= TESTS_PER_LEVEL) return progress;
    return { ...(progress || {}), [level]: done + 1 };
  }

  const api = { LEVEL_COUNT, TESTS_PER_LEVEL, testConfig, passes, cleared, nextTest, isUnlocked, withResult };
  root.TT = Object.assign(root.TT || {}, { levels: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
