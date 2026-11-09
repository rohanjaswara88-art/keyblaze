const test = require('node:test');
const assert = require('node:assert/strict');
const stats = require('../js/stats.js');
const ranks = require('../js/ranks.js');
const words = require('../js/words.js');

test('wpm counts 5 characters as one word per minute', () => {
  assert.equal(stats.wpmFromChars(50, 60000), 10);
  assert.equal(stats.wpmFromChars(0, 60000), 0);
  assert.equal(stats.wpmFromChars(10, 0), 0);
});

test('accuracy is 100 with no keystrokes and clamps to 0..100', () => {
  assert.equal(stats.accuracy(0, 0), 100);
  assert.equal(stats.accuracy(9, 10), 90);
});

test('consistency is 100 for steady speed and drops with variation', () => {
  assert.equal(stats.consistency([60, 60, 60, 60]), 100);
  const shaky = stats.consistency([20, 100, 30, 110]);
  assert.ok(shaky < 70 && shaky > 0, `got ${shaky}`);
  assert.equal(stats.consistency([0, 0, 0]), 0);
});

test('countChars separates correct, wrong, extra and missed letters', () => {
  const c = stats.countChars(['hello', 'world', 'again'], ['hello', 'wrld', 'aga']);
  assert.equal(c.correctChars, 5 + 1 + 3);
  assert.equal(c.incorrectChars, 3); // "wrld" vs "worl": r/o, l/r, d/l
  assert.equal(c.missedChars, 1); // d missing from "world"
  assert.equal(c.extraChars, 0);
  // "hello " + partial "aga" count towards net speed, the wrong word does not.
  assert.equal(c.correctWordChars, 6 + 3);
});

test('countChars flags extra letters', () => {
  const c = stats.countChars(['cat'], ['cats']);
  assert.equal(c.extraChars, 1);
  assert.equal(c.correctWordChars, 0);
});

test('computeResult gives net wpm from correct words only', () => {
  const r = stats.computeResult({
    targetWords: ['abcd', 'abcd'], typedWords: ['abcd', 'abcd'], elapsedMs: 6000,
    correctKeystrokes: 9, totalKeystrokes: 9, rawSamples: [90, 90, 90],
  });
  // 4 + 1 space + 4 = 9 chars in 0.1 min -> 18 wpm.
  assert.equal(r.wpm, 18);
  assert.equal(r.accuracy, 100);
  assert.equal(r.consistency, 100);
});

test('getRank maps rating to tier and division', () => {
  assert.equal(ranks.getRank(0).label, 'Stone III');
  assert.equal(ranks.getRank(99).label, 'Stone III');
  assert.equal(ranks.getRank(100).label, 'Stone II');
  assert.equal(ranks.getRank(250).label, 'Stone I');
  assert.equal(ranks.getRank(300).label, 'Bronze III');
  assert.equal(ranks.getRank(250).next, 'Bronze III');
  assert.equal(ranks.getRank(ranks.APEX_RP - 1).next, 'Apex');
  const apex = ranks.getRank(ranks.APEX_RP + 500);
  assert.equal(apex.label, 'Apex');
  assert.equal(apex.next, null);
  assert.equal(ranks.getRank(-50).rp, 0);
});

test('allRanks lists 3 divisions per tier plus a single Apex', () => {
  const all = ranks.allRanks();
  assert.equal(all.length, (ranks.TIERS.length - 1) * 3 + 1);
  assert.equal(all[all.length - 1].label, 'Apex');
  for (let i = 1; i < all.length; i += 1) assert.ok(all[i].minRp > all[i - 1].minRp);
});

test('ratingDelta rewards beating par and is bounded', () => {
  const fast = ranks.ratingDelta({ wpm: 80, accuracy: 100, seconds: 60 }, 0);
  const slow = ranks.ratingDelta({ wpm: 5, accuracy: 100, seconds: 60 }, 3000);
  assert.ok(fast > 0 && fast <= 75);
  assert.ok(slow < 0 && slow >= -30);
});

test('ratingDelta gives nothing for very short or empty tests and never goes below zero', () => {
  assert.equal(ranks.ratingDelta({ wpm: 100, accuracy: 100, seconds: 2 }, 0), 0);
  assert.equal(ranks.ratingDelta({ wpm: 0, accuracy: 0, seconds: 30 }, 50), 0);
  // Would be -6, but only 3 RP are left to lose.
  assert.equal(ranks.ratingDelta({ wpm: 5, accuracy: 100, seconds: 60 }, 3), -3);
});

test('ratingDelta never rewards sloppy accuracy', () => {
  assert.ok(ranks.ratingDelta({ wpm: 200, accuracy: 60, seconds: 60 }, 0) <= 0);
});

test('badgeSVG renders valid-looking markup for every rank', () => {
  ranks.allRanks().forEach((r) => {
    const svg = ranks.badgeSVG(r.tierIndex, r.division, { animated: true });
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.ok(!svg.includes('undefined'), `${r.label} badge has undefined`);
  });
});

test('generateWords returns the requested count and no immediate repeats', () => {
  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const list = words.generateWords(200, { rng });
  assert.equal(list.length, 200);
  assert.ok(list.every((w) => w.length > 0));
  const withPunct = words.generateWords(50, { rng, punctuation: true });
  assert.match(withPunct[0], /^[A-Z]/);
});
