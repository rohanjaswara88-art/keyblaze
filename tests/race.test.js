const test = require('node:test');
const assert = require('node:assert/strict');
const { charsBefore } = require('../js/race.js');

test('progress counts each finished word plus the space after it', () => {
  const words = ['the', 'quick', 'fox'];
  assert.equal(charsBefore(words, 0), 0);
  assert.equal(charsBefore(words, 1), 4); // "the "
  assert.equal(charsBefore(words, 2), 10); // "the quick "
});

test('progress lines up with the passage the server checks against', () => {
  const text = 'the quick fox';
  const words = text.split(' ');
  // After the second word the player stands at the start of the last one.
  assert.equal(text.slice(charsBefore(words, 2)), 'fox');
});
