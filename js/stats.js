/* Pure statistics helpers: WPM, accuracy, consistency. No DOM access. */
(function (root) {
  'use strict';

  const CHARS_PER_WORD = 5;
  const MS_PER_MINUTE = 60000;

  function wpmFromChars(chars, elapsedMs) {
    if (!elapsedMs || elapsedMs <= 0 || chars <= 0) return 0;
    return (chars / CHARS_PER_WORD) / (elapsedMs / MS_PER_MINUTE);
  }

  function accuracy(correctKeystrokes, totalKeystrokes) {
    if (!totalKeystrokes) return 100;
    return Math.max(0, Math.min(100, (correctKeystrokes / totalKeystrokes) * 100));
  }

  function mean(values) {
    if (!values.length) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  function stdev(values) {
    if (values.length < 2) return 0;
    const m = mean(values);
    const variance = values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Consistency in [0, 100]: 100 means every second had the same speed.
   * Uses the coefficient of variation, squashed with tanh so outliers don't go negative.
   */
  function consistency(samples) {
    const usable = samples.filter((v) => Number.isFinite(v));
    if (usable.length < 2) return 100;
    const m = mean(usable);
    if (m === 0) return 0;
    const cv = stdev(usable) / m;
    return Math.round((1 - Math.tanh(cv)) * 1000) / 10;
  }

  /**
   * Scores a finished set of words.
   * @param {string[]} targetWords words the user was asked to type
   * @param {string[]} typedWords words the user actually typed (last one may be partial)
   * @returns {{correctChars:number, incorrectChars:number, extraChars:number, missedChars:number, correctWordChars:number}}
   */
  function countChars(targetWords, typedWords) {
    let correctChars = 0;
    let incorrectChars = 0;
    let extraChars = 0;
    let missedChars = 0;
    let correctWordChars = 0;
    const lastIndex = typedWords.length - 1;

    typedWords.forEach((typed, i) => {
      const target = targetWords[i] || '';
      const isLast = i === lastIndex;
      for (let c = 0; c < Math.max(typed.length, target.length); c += 1) {
        if (c >= typed.length) {
          if (!isLast) missedChars += 1;
        } else if (c >= target.length) {
          extraChars += 1;
        } else if (typed[c] === target[c]) {
          correctChars += 1;
        } else {
          incorrectChars += 1;
        }
      }
      const fullyCorrect = typed === target;
      const partialCorrect = isLast && target.startsWith(typed);
      if (fullyCorrect || partialCorrect) {
        // A space follows every completed word except the last.
        correctWordChars += typed.length + (isLast ? 0 : 1);
      }
    });

    return { correctChars, incorrectChars, extraChars, missedChars, correctWordChars };
  }

  /**
   * Final results for a test.
   * @param {{targetWords:string[], typedWords:string[], elapsedMs:number,
   *          correctKeystrokes:number, totalKeystrokes:number, rawSamples:number[]}} input
   */
  function computeResult(input) {
    const chars = countChars(input.targetWords, input.typedWords);
    const typedTotal = input.typedWords.reduce((sum, w) => sum + w.length, 0) +
      Math.max(0, input.typedWords.length - 1);
    return {
      wpm: Math.round(wpmFromChars(chars.correctWordChars, input.elapsedMs) * 10) / 10,
      raw: Math.round(wpmFromChars(typedTotal, input.elapsedMs) * 10) / 10,
      accuracy: Math.round(accuracy(input.correctKeystrokes, input.totalKeystrokes) * 10) / 10,
      consistency: consistency(input.rawSamples || []),
      chars,
      seconds: Math.round(input.elapsedMs / 100) / 10,
    };
  }

  const api = { wpmFromChars, accuracy, mean, stdev, consistency, countChars, computeResult };
  root.TT = Object.assign(root.TT || {}, { stats: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
