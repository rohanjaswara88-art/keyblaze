const test = require('node:test');
const assert = require('node:assert/strict');
const levels = require('../js/levels.js');
const words = require('../js/words.js');

const { LEVEL_COUNT, TESTS_PER_LEVEL } = levels;

test('there is one level per rank tier and ten tests in each', () => {
  assert.equal(LEVEL_COUNT, 13);
  assert.equal(TESTS_PER_LEVEL, 10);
});

test('every test is at least as hard as the one before it', () => {
  let prev = null;
  for (let level = 0; level < LEVEL_COUNT; level += 1) {
    for (let t = 0; t < TESTS_PER_LEVEL; t += 1) {
      const c = levels.testConfig(level, t);
      if (prev) {
        assert.ok(c.targetWpm >= prev.targetWpm, `wpm dropped at ${level}/${t}`);
        assert.ok(c.minAcc >= prev.minAcc, `accuracy dropped at ${level}/${t}`);
        assert.ok(c.amount >= prev.amount, `length dropped at ${level}/${t}`);
      }
      prev = c;
    }
  }
});

test('each level is strictly harder than the previous level', () => {
  for (let level = 1; level < LEVEL_COUNT; level += 1) {
    const lastOfPrev = levels.testConfig(level - 1, TESTS_PER_LEVEL - 1);
    const firstOfThis = levels.testConfig(level, 0);
    assert.ok(firstOfThis.targetWpm > lastOfPrev.targetWpm, `level ${level}`);
  }
});

test('the last test of a level asks for that rank tier target speed', () => {
  assert.equal(levels.testConfig(0, 9).targetWpm, 15);
  assert.equal(levels.testConfig(12, 9).targetWpm, 150);
});

test('punctuation and numbers arrive in the later levels', () => {
  assert.equal(levels.testConfig(0, 0).punctuation, false);
  assert.equal(levels.testConfig(0, 0).numbers, false);
  assert.equal(levels.testConfig(12, 9).punctuation, true);
  assert.equal(levels.testConfig(12, 9).numbers, true);
});

test('testConfig clamps out of range input', () => {
  assert.deepEqual(levels.testConfig(-4, -1), levels.testConfig(0, 0));
  assert.deepEqual(levels.testConfig(99, 99), levels.testConfig(12, 9));
});

test('a test passes only when both speed and accuracy targets are met', () => {
  const c = levels.testConfig(3, 4);
  assert.equal(levels.passes(c, { wpm: c.targetWpm, accuracy: c.minAcc }), true);
  assert.equal(levels.passes(c, { wpm: c.targetWpm - 1, accuracy: 100 }), false);
  assert.equal(levels.passes(c, { wpm: 999, accuracy: c.minAcc - 1 }), false);
});

test('clearing the next test unlocks the one after it, without mutating', () => {
  const start = {};
  const after = levels.withResult(start, 2, 0, true);
  assert.deepEqual(start, {});
  assert.equal(levels.cleared(after, 2), 1);
  assert.equal(levels.nextTest(after, 2), 1);
  assert.equal(levels.isUnlocked(after, 2, 1), true);
  assert.equal(levels.isUnlocked(after, 2, 2), false);
});

test('failing, or replaying an old test, does not change progress', () => {
  const one = levels.withResult({}, 0, 0, true);
  assert.equal(levels.withResult(one, 0, 1, false), one);
  assert.equal(levels.withResult(one, 0, 0, true), one);
});

test('a finished level stays at ten and points at its last test', () => {
  let p = {};
  for (let t = 0; t < TESTS_PER_LEVEL; t += 1) p = levels.withResult(p, 5, t, true);
  assert.equal(levels.cleared(p, 5), 10);
  assert.equal(levels.nextTest(p, 5), 9);
  assert.equal(levels.withResult(p, 5, 9, true), p);
});

test('cleared ignores corrupt stored values', () => {
  assert.equal(levels.cleared({ 1: 'x' }, 1), 0);
  assert.equal(levels.cleared({ 1: 40 }, 1), 10);
  assert.equal(levels.cleared(null, 1), 0);
});

test('generateWords honours word length limits', () => {
  const short = words.generateWords(200, { maxLength: 4 });
  assert.ok(short.every((w) => w.length <= 4));
  const long = words.generateWords(200, { minLength: 7 });
  assert.ok(long.every((w) => w.length >= 7));
});
