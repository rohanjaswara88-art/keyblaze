/* Rank tiers, rating math (pure), and procedural SVG badge art. */
(function (root) {
  'use strict';

  const RP_PER_DIVISION = 100;
  const DIVISIONS_PER_TIER = 3;
  const DIVISION_LABELS = ['III', 'II', 'I'];
  const MIN_SECONDS_FOR_RATING = 5;
  const MIN_ACCURACY_FOR_GAIN = 75;
  const MAX_GAIN = 75;
  const MAX_LOSS = -30;

  // light = highlight colour, base = body colour, dark = rim / shadow colour.
  const TIERS = [
    { name: 'Stone', par: 15, light: '#d5d9de', base: '#9aa0a6', dark: '#4a4f55' },
    { name: 'Bronze', par: 25, light: '#ffc89a', base: '#d98b4f', dark: '#6e3613' },
    { name: 'Silver', par: 35, light: '#ffffff', base: '#bcc6d3', dark: '#5d6979' },
    { name: 'Gold', par: 45, light: '#fff3b0', base: '#f4c542', dark: '#8a5a00' },
    { name: 'Platinum', par: 55, light: '#d8fffa', base: '#6fdccf', dark: '#1e6f69' },
    { name: 'Jade', par: 65, light: '#c9ffe0', base: '#3fd17f', dark: '#0b5a32' },
    { name: 'Sapphire', par: 75, light: '#cfe1ff', base: '#4f8dff', dark: '#132f86' },
    { name: 'Ruby', par: 85, light: '#ffd0d8', base: '#ff4769', dark: '#7a0a22' },
    { name: 'Amethyst', par: 95, light: '#f0dcff', base: '#b07aff', dark: '#4b1a91' },
    { name: 'Diamond', par: 105, light: '#ffffff', base: '#9eeaff', dark: '#2a87b3' },
    { name: 'Obsidian', par: 120, light: '#c9b6ff', base: '#5b3cc4', dark: '#120a2e' },
    { name: 'Celestial', par: 135, light: '#fff6d6', base: '#ff9ee8', dark: '#6a3cff' },
    { name: 'Apex', par: 150, light: '#fff1a8', base: '#ff5a36', dark: '#7a0010' },
  ];

  const APEX_INDEX = TIERS.length - 1;
  const APEX_RP = APEX_INDEX * DIVISIONS_PER_TIER * RP_PER_DIVISION;

  /** Resolves a rating to its rank. */
  function getRank(rp) {
    const safe = Math.max(0, Math.floor(rp || 0));
    if (safe >= APEX_RP) {
      const tier = TIERS[APEX_INDEX];
      return {
        tierIndex: APEX_INDEX, division: 0, label: tier.name, tier,
        rp: safe, progress: 1, rpIntoDivision: safe - APEX_RP, rpForNext: null, next: null,
      };
    }
    const step = Math.floor(safe / RP_PER_DIVISION);
    const tierIndex = Math.floor(step / DIVISIONS_PER_TIER);
    const divisionIndex = step % DIVISIONS_PER_TIER;
    const tier = TIERS[tierIndex];
    const rpIntoDivision = safe - step * RP_PER_DIVISION;
    const nextStep = step + 1;
    const nextTierIndex = Math.floor(nextStep / DIVISIONS_PER_TIER);
    const nextLabel = nextTierIndex >= APEX_INDEX
      ? TIERS[APEX_INDEX].name
      : `${TIERS[nextTierIndex].name} ${DIVISION_LABELS[nextStep % DIVISIONS_PER_TIER]}`;
    return {
      tierIndex,
      division: DIVISIONS_PER_TIER - divisionIndex,
      label: `${tier.name} ${DIVISION_LABELS[divisionIndex]}`,
      tier,
      rp: safe,
      progress: rpIntoDivision / RP_PER_DIVISION,
      rpIntoDivision,
      rpForNext: RP_PER_DIVISION - rpIntoDivision,
      next: nextLabel,
    };
  }

  /** Multiplier so a 15 second sprint is worth less than a full minute. */
  function durationWeight(seconds) {
    return Math.max(0.5, Math.min(1.2, seconds / 50));
  }

  /**
   * Rating change for a finished test.
   * Beating your tier's par WPM earns more; falling far below it costs a little.
   * @param {{wpm:number, accuracy:number, seconds:number}} result
   * @param {number} currentRp
   * @returns {number}
   */
  function ratingDelta(result, currentRp) {
    if (!result || result.seconds < MIN_SECONDS_FOR_RATING || result.wpm < 5) return 0;
    const rank = getRank(currentRp);
    const performance = result.wpm * Math.pow(result.accuracy / 100, 2);
    let delta = (10 + (performance - rank.tier.par) * 1.5) * durationWeight(result.seconds);
    if (result.accuracy < MIN_ACCURACY_FOR_GAIN) delta = Math.min(delta, 0);
    delta = Math.max(MAX_LOSS, Math.min(MAX_GAIN, Math.round(delta)));
    // Never drop below zero rating.
    return Math.max(-Math.max(0, Math.floor(currentRp || 0)), delta);
  }

  /** Every rank in order, lowest first. */
  function allRanks() {
    const list = [];
    TIERS.forEach((tier, tierIndex) => {
      if (tierIndex === APEX_INDEX) {
        list.push({ tierIndex, division: 0, label: tier.name, minRp: APEX_RP, tier });
        return;
      }
      DIVISION_LABELS.forEach((d, i) => {
        list.push({
          tierIndex,
          division: DIVISIONS_PER_TIER - i,
          label: `${tier.name} ${d}`,
          minRp: (tierIndex * DIVISIONS_PER_TIER + i) * RP_PER_DIVISION,
          tier,
        });
      });
    });
    return list;
  }

  /* ---------------------------------------------------------------- *
   * Badge art: a stencil emblem (js/emblems.js) filled with a metal
   * gradient, wrapped in a soft tier-coloured glow and a slow light sweep.
   * ---------------------------------------------------------------- */

  const Emblems = root.TT && root.TT.emblems
    ? root.TT.emblems
    : (typeof require === 'function' ? require('./emblems.js') : null);

  let badgeCounter = 0;

  function divisionMarks(division, tier) {
    if (division <= 0) return '';
    const count = DIVISIONS_PER_TIER - division + 1;
    const spacing = 13;
    const start = 100 - ((count - 1) * spacing) / 2;
    let out = '';
    for (let i = 0; i < count; i += 1) {
      const x = start + i * spacing;
      out += `<polygon points="${x},186 ${x + 4},191 ${x},196 ${x - 4},191" fill="${tier.light}"/>`;
    }
    return `<g class="badge-pips">${out}</g>`;
  }

  /**
   * Returns SVG markup for a rank badge.
   * @param {number} tierIndex
   * @param {number} division 3..1, or 0 for Apex
   * @param {{animated?: boolean, locked?: boolean}} [options]
   */
  function badgeSVG(tierIndex, division, options) {
    const opts = options || {};
    const index = Math.max(0, Math.min(APEX_INDEX, tierIndex));
    const tier = TIERS[index];
    const animated = Boolean(opts.animated);
    badgeCounter += 1;
    const id = `bdg${badgeCounter}`;
    const art = Emblems.emblem(index, animated);
    const glowAnim = animated
      ? '<animate attributeName="stdDeviation" values="3;6;3" dur="4s" repeatCount="indefinite"/>'
      : '';
    const shine = animated
      ? `<rect x="0" y="0" width="200" height="200" fill="url(#${id}-shine)" mask="url(#${id}-m)" opacity="0.7"/>`
      : '';
    const classes = ['badge-svg', `tier-${index}`];
    if (animated) classes.push('is-animated');
    if (opts.locked) classes.push('is-locked');

    return `<svg class="${classes.join(' ')}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${tier.name} badge">` +
      '<defs>' +
      `<linearGradient id="${id}-fill" x1="0" y1="0" x2="0.25" y2="1"><stop offset="0" stop-color="#fbfcff"/>` +
      `<stop offset="0.55" stop-color="${tier.light}"/><stop offset="1" stop-color="${tier.base}"/></linearGradient>` +
      `<linearGradient id="${id}-shine" gradientUnits="userSpaceOnUse" x1="-60" y1="0" x2="0" y2="40">` +
      '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.9"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
      (animated ? `<animateTransform attributeName="gradientTransform" type="translate" values="-40 0;300 0;300 0" keyTimes="0;0.45;1" dur="${5 + (index % 3)}s" repeatCount="indefinite"/>` : '') +
      '</linearGradient>' +
      `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">` +
      `<rect x="0" y="0" width="200" height="200" fill="#000"/>${art.shapes}</mask>` +
      `<filter id="${id}-glow" x="-25%" y="-25%" width="150%" height="150%">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur">${glowAnim}</feGaussianBlur>` +
      `<feFlood flood-color="${tier.base}" flood-opacity="0.75"/><feComposite in2="blur" operator="in" result="glow"/>` +
      '<feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>' +
      art.under(tier, animated) +
      `<g filter="url(#${id}-glow)"><rect x="0" y="0" width="200" height="200" fill="url(#${id}-fill)" mask="url(#${id}-m)"/></g>` +
      shine +
      divisionMarks(division, tier) +
      '</svg>';
  }

  const api = {
    TIERS, RP_PER_DIVISION, APEX_RP, getRank, ratingDelta, durationWeight, allRanks, badgeSVG,
  };
  root.TT = Object.assign(root.TT || {}, { ranks: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
