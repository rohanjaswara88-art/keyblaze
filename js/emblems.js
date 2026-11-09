/*
 * Stencil-style rank emblems, one per tier. Each emblem is drawn as a mask
 * (white = solid, black = carved out) so the badge can fill it with a metal
 * gradient, glow and shine. "under" parts sit behind the solid body and show
 * through carved holes (glowing eyes, mouths). SMIL is used for motion because
 * it animates reliably inside SVG masks.
 */
(function (root) {
  'use strict';

  const C = 100; // centre of the 200x200 badge

  const n = (v) => Number(v.toFixed(1));
  const pts = (list) => list.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');
  const mirror = (markup) => `<g transform="translate(200 0) scale(-1 1)">${markup}</g>`;

  function spin(anim, dur, reverse, cx, cy) {
    if (!anim) return '';
    const x = cx == null ? C : cx;
    const y = cy == null ? C : cy;
    return `<animateTransform attributeName="transform" type="rotate" from="0 ${x} ${y}" to="${reverse ? -360 : 360} ${x} ${y}"` +
      ` dur="${dur}s" repeatCount="indefinite"/>`;
  }

  function sway(anim, deg, dur, cx, cy, delay) {
    if (!anim) return '';
    return `<animateTransform attributeName="transform" type="rotate" values="0 ${cx} ${cy};${deg} ${cx} ${cy};0 ${cx} ${cy}"` +
      ` dur="${dur}s" begin="${delay || 0}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>`;
  }

  function pulse(anim, from, to, dur, delay) {
    if (!anim) return '';
    return `<animate attributeName="opacity" values="${from};${to};${from}" dur="${dur}s" begin="${delay || 0}s"` +
      ' repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>';
  }

  /** Horizontal "breathing" around the centre line, for wings. */
  function flap(anim, inner, amount, dur) {
    if (!anim) return inner;
    return `<g transform="translate(${C} 0)"><g><animateTransform attributeName="transform" type="scale"` +
      ` values="1 1;${amount} 1;1 1" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>` +
      `<g transform="translate(${-C} 0)">${inner}</g></g></g>`;
  }

  function polar(cx, cy, r, deg) {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  }

  /** A wavy, pointed flame ray from radius r0 to r1, rotated to `angle`. */
  function ray(o) {
    const { cx = C, cy = C, angle, r0, r1, w, curl } = o;
    const b = cy - r0;
    const t = cy - r1;
    const L = r1 - r0;
    const d = `M${n(cx - w)} ${n(b)} C${n(cx - w * 1.1 + curl * 0.25)} ${n(b - L * 0.4)} ${n(cx + curl * 1.25 - w * 0.35)} ${n(b - L * 0.72)} ${n(cx + curl)} ${n(t)}` +
      ` C${n(cx + curl * 0.95 + w * 0.45)} ${n(b - L * 0.66)} ${n(cx + w * 1.05 - curl * 0.2)} ${n(b - L * 0.34)} ${n(cx + w)} ${n(b)} Z`;
    return `<path d="${d}" fill="#fff" transform="rotate(${angle} ${cx} ${cy})"/>`;
  }

  function star4(cx, cy, r, fill) {
    const i = r * 0.26;
    return `<polygon fill="${fill}" points="${pts([[cx, cy - r], [cx + i, cy - i], [cx + r, cy], [cx + i, cy + i], [cx, cy + r], [cx - i, cy + i], [cx - r, cy], [cx - i, cy - i]])}"/>`;
  }

  function starN(cx, cy, points, outer, inner, fill) {
    const list = [];
    for (let k = 0; k < points * 2; k += 1) list.push(polar(cx, cy, k % 2 ? inner : outer, (k * 180) / points));
    return `<polygon fill="${fill}" points="${pts(list)}"/>`;
  }

  /** Smooth closed curve through points (Catmull-Rom converted to cubic Bezier). */
  function smoothClosed(list) {
    const len = list.length;
    let d = `M${n(list[0][0])} ${n(list[0][1])}`;
    for (let i = 0; i < len; i += 1) {
      const p0 = list[(i - 1 + len) % len];
      const p1 = list[i];
      const p2 = list[(i + 1) % len];
      const p3 = list[(i + 2) % len];
      d += ` C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
    }
    return `${d} Z`;
  }

  /** Mirror a right-half outline (top centre -> bottom centre) into a full symmetric polygon. */
  function symmetric(rightHalf) {
    const left = rightHalf.slice(1, -1).reverse().map(([x, y]) => [200 - x, y]);
    return pts([...rightHalf, ...left]);
  }

  const line = (d, w) => `<path d="${d}" fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

  /* ------------------------------------------------------------------ */

  const EMBLEMS = [
    // 0 Stone: a carved rune stone.
    function stone() {
      const radii = [54, 48, 55, 50, 56, 47, 53, 51, 49];
      const outline = radii.map((r, i) => {
        const [x, y] = polar(C, C, r, i * 40 + 10);
        return [x, C + (y - C) * 0.92];
      });
      return {
        shapes: `<path d="${smoothClosed(outline)}" fill="#fff"/>` +
          `<path d="${smoothClosed(outline.map(([x, y]) => [C + (x - C) * 0.8, C + (y - C) * 0.8]))}" fill="none" stroke="#000" stroke-width="2.5"/>` +
          line('M100 66 L100 132', 7) + line('M100 84 L122 70 M100 104 L122 90', 6) + '<circle cx="80" cy="122" r="4" fill="#000"/>',
      };
    },

    // 1 Bronze: a rising sprout.
    function sprout(a) {
      const leaf = '<path d="M98 160 C66 152 40 118 48 64 C80 74 102 112 98 160 Z" fill="#fff"/>' +
        line('M94 150 C82 130 68 104 58 80', 4);
      const swaying = `<g>${sway(a, -4, 6, 98, 160)}${leaf}</g>`;
      return {
        shapes: swaying + mirror(swaying) +
          `<g><path d="M100 26 C113 50 118 70 100 94 C82 70 87 50 100 26 Z" fill="#fff"/>${pulse(a, 1, 0.75, 4)}</g>` +
          '<path d="M66 168 Q100 156 134 168 L131 175 Q100 165 69 175 Z" fill="#fff"/>',
      };
    },

    // 2 Silver: crescent moon with stars.
    function crescent(a) {
      return {
        shapes: '<circle cx="92" cy="100" r="58" fill="#fff"/><circle cx="118" cy="86" r="49" fill="#000"/>' +
          `<g>${star4(140, 126, 15, '#fff')}${pulse(a, 1, 0.25, 3)}</g>` +
          `<g>${star4(152, 66, 9, '#fff')}${pulse(a, 1, 0.2, 3.6, 1.2)}</g>` +
          `<g>${star4(128, 42, 6, '#fff')}${pulse(a, 0.9, 0.15, 2.8, 0.6)}</g>`,
      };
    },

    // 3 Gold: blazing sun with wavy flames.
    function sun(a) {
      let rays = '';
      for (let i = 0; i < 12; i += 1) {
        const long = i % 2 === 0;
        rays += ray({ angle: i * 30 + 8, r0: 44, r1: long ? 92 : 68, w: long ? 9 : 7, curl: long ? 11 : -7 });
      }
      return {
        shapes: `<g>${rays}${spin(a, 80)}</g><circle cx="100" cy="100" r="35" fill="#fff"/>`,
      };
    },

    // 4 Platinum: eclipse, a crescent wreathed in flame.
    function eclipse(a) {
      const angles = [150, 175, 200, 225, 250, 275, 300, 325, 350, 15];
      const lengths = [70, 88, 72, 92, 68, 90, 74, 86, 94, 70];
      const rays = angles.map((ang, i) => ray({ angle: ang, r0: 48, r1: lengths[i], w: i % 2 ? 6 : 8, curl: i % 2 ? -8 : 9 })).join('');
      return {
        shapes: `<g>${rays}${sway(a, 5, 7, C, C)}</g>` +
          '<circle cx="100" cy="100" r="42" fill="#fff"/><circle cx="118" cy="90" r="35" fill="#000"/>',
      };
    },

    // 5 Jade: five-petal bloom.
    function bloom(a) {
      const petal = '<path d="M100 100 C95 90 70 70 70 44 C70 26 90 20 100 34 C110 20 130 26 130 44 C130 70 105 90 100 100 Z" fill="#fff"/>';
      let petals = '';
      for (let i = 0; i < 5; i += 1) petals += `<g transform="rotate(${i * 72} 100 100)">${petal}</g>`;
      return {
        shapes: `<g>${petals}${starN(C, C, 5, 11, 4.5, '#000')}${spin(a, 120)}</g>`,
      };
    },

    // 6 Sapphire: water drop with a swirling current.
    function tide(a) {
      const spiral = [];
      for (let t = 0; t <= Math.PI * 4; t += 0.15) {
        const r = 3 + t * 2.3;
        spiral.push([C + r * Math.cos(t), 118 + r * Math.sin(t)]);
      }
      return {
        shapes: '<path d="M100 20 C118 54 146 80 146 116 C146 144 125 166 100 166 C75 166 54 144 54 116 C54 80 82 54 100 20 Z" fill="#fff"/>' +
          `<g>${line(`M${spiral.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')}`, 6)}${spin(a, 16, true, C, 118)}</g>` +
          line('M72 104 Q74 84 88 68', 5),
      };
    },

    // 7 Ruby: phoenix flame.
    function flame(a) {
      const side = (sign, delay) => `<g>${ray({ cx: C, cy: 168, angle: 38 * sign, r0: 18, r1: 108, w: 13, curl: 16 * sign })}` +
        `${ray({ cx: C, cy: 168, angle: 66 * sign, r0: 14, r1: 76, w: 10, curl: 12 * sign })}${sway(a, 4 * sign, 3.2, C, 168, delay)}</g>`;
      return {
        shapes: side(-1, 0) + side(1, 0.8) +
          '<path d="M100 22 C118 50 134 72 132 106 C130 140 114 160 100 168 C86 160 70 140 68 106 C66 72 82 50 100 22 Z" fill="#fff"/>' +
          '<path d="M100 76 C112 98 118 116 114 134 C110 148 90 148 86 134 C82 116 88 98 100 76 Z" fill="#000"/>' +
          `<g><path d="M100 106 C107 119 109 128 105 138 C103 143 97 143 95 138 C91 128 93 119 100 106 Z" fill="#fff"/>${pulse(a, 1, 0.35, 1.6)}</g>`,
      };
    },

    // 8 Amethyst: tribal moth.
    function moth(a) {
      const wing = '<path d="M104 94 C118 52 158 30 178 44 C192 56 176 96 106 106 Z" fill="#fff"/>' +
        '<path d="M106 112 C148 112 170 136 156 160 C142 176 116 150 104 120 Z" fill="#fff"/>' +
        '<circle cx="156" cy="62" r="9" fill="#000"/><circle cx="156" cy="62" r="3.5" fill="#fff"/>' +
        '<circle cx="144" cy="146" r="6" fill="#000"/>' + line('M112 100 C130 88 150 76 168 54', 2.5);
      const antenna = '<path d="M104 70 C110 50 122 38 136 34" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="136" cy="34" r="3.5" fill="#fff"/>';
      return {
        shapes: flap(a, wing + mirror(wing), 0.84, 2.6) + antenna + mirror(antenna) +
          '<ellipse cx="100" cy="112" rx="8" ry="40" fill="#fff"/><circle cx="100" cy="70" r="8.5" fill="#fff"/>' +
          line('M95 100 L105 100 M95 114 L105 114 M96 128 L104 128', 2),
      };
    },

    // 9 Diamond: wolf crest.
    function wolf() {
      const head = symmetric([[100, 62], [116, 56], [130, 20], [142, 60], [150, 52], [166, 46], [156, 72], [182, 78], [158, 94], [178, 108], [150, 114],
        [140, 134], [124, 148], [110, 156], [100, 172]]);
      const eye = [[108, 104], [138, 88], [128, 106], [112, 110]];
      const ear = [[126, 54], [131, 32], [137, 58]];
      const holes = `<polygon points="${pts(eye)}" fill="#000"/><polygon points="${pts(ear)}" fill="#000"/>${line('M146 100 L160 96', 3)}`;
      return {
        shapes: `<polygon points="${head}" fill="#fff"/>${holes}${mirror(holes)}` +
          `<polygon points="${pts([[100, 74], [106, 84], [100, 94], [94, 84]])}" fill="#000"/>` + line('M88 126 L100 136 L112 126', 4) +
          `<polygon points="${pts([[86, 40], [100, 26], [114, 40], [108, 44], [100, 36], [92, 44]])}" fill="#fff"/>`,
        under: (tier, a) => `<g><polygon points="${pts(eye)}" fill="${tier.light}"/>${mirror(`<polygon points="${pts(eye)}" fill="${tier.light}"/>`)}${pulse(a, 1, 0.2, 3)}</g>`,
      };
    },

    // 10 Obsidian: grinning oni mask.
    function oni() {
      const face = 'M100 56 C116 54 130 56 140 62 C146 46 154 30 168 16 C168 36 164 54 156 70 C162 92 160 116 150 136 C140 154 120 166 100 170' +
        ' C80 166 60 154 50 136 C40 116 38 92 44 70 C36 54 32 36 32 16 C46 30 54 46 60 62 C70 56 84 54 100 56 Z';
      const eye = 'M110 96 C122 86 136 82 147 82 C141 96 127 104 112 102 Z';
      const top = [];
      const bottom = [];
      const teeth = 16;
      for (let i = 0; i <= teeth; i += 1) {
        const x = 64 + (i * 72) / teeth;
        const u = (x - C) / 36;
        const k = Math.max(0, 1 - u * u);
        top.push([x, 122 + 10 * k + (i % 2 ? 9 * Math.sqrt(k) : 0)]);
        bottom.push([x, 122 + 30 * k - (i % 2 ? 9 * Math.sqrt(k) : 0)]);
      }
      const mouth = pts([...top, ...bottom.reverse()]);
      return {
        shapes: `<path d="${face}" fill="#fff"/><path d="${eye}" fill="#000"/>${mirror(`<path d="${eye}" fill="#000"/>`)}` +
          `<polygon points="${mouth}" fill="#000"/>${line('M112 84 L146 70', 3)}${mirror(line('M112 84 L146 70', 3))}` +
          `<polygon points="${pts([[100, 66], [105, 74], [100, 82], [95, 74]])}" fill="#000"/>`,
        under: (tier, a) => `<g fill="${tier.light}"><path d="${eye}"/>${mirror(`<path d="${eye}"/>`)}<polygon points="${mouth}"/>${pulse(a, 0.95, 0.15, 2.6)}</g>`,
      };
    },

    // 11 Celestial: sun cradling a moon.
    function sunMoon(a) {
      let rays = '';
      for (let i = 0; i < 16; i += 1) {
        const long = i % 2 === 0;
        rays += ray({ angle: i * 22.5 + 4, r0: 49, r1: long ? 94 : 72, w: long ? 7 : 5, curl: long ? 9 : -6 });
      }
      return {
        shapes: `<g>${rays}${spin(a, 140)}</g><circle cx="100" cy="100" r="41" fill="#fff"/>` +
          '<circle cx="96" cy="104" r="30" fill="#000"/><circle cx="110" cy="94" r="27" fill="#fff"/>' +
          `<g>${star4(118, 120, 7, '#000')}${pulse(a, 1, 0.3, 2.4)}</g>`,
      };
    },

    // 12 Apex: crowned dragon crest.
    function dragon(a) {
      const angles = [-58, -36, -14, 8, 30];
      const lengths = [86, 92, 88, 78, 62];
      const blades = angles.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const y0 = 88 + i * 8;
        const tip = [108 + lengths[i] * Math.cos(rad), y0 + 4 + lengths[i] * Math.sin(rad)];
        const notch = [108 + lengths[i] * 0.62 * Math.cos(rad) + 4, y0 + 10 + lengths[i] * 0.62 * Math.sin(rad)];
        return `<polygon points="${pts([[108, y0], tip, notch, [108, y0 + 9]])}" fill="#fff"/>`;
      }).join('');
      const eye = [[100, 84], [110, 98], [100, 112], [90, 98]];
      return {
        shapes: flap(a, blades + mirror(blades), 0.9, 3.4) +
          `<polygon points="${pts([[100, 48], [124, 98], [100, 160], [76, 98]])}" fill="#fff"/>` +
          `<polygon points="${pts(eye)}" fill="#000"/><rect x="98" y="89" width="4" height="18" rx="2" fill="#fff"/>` +
          `<polygon points="${pts([[76, 46], [82, 20], [92, 36], [100, 10], [108, 36], [118, 20], [124, 46]])}" fill="#fff"/>` +
          line('M82 40 L118 40', 3) + ray({ angle: 180, r0: 56, r1: 82, w: 9, curl: 7 }),
        under: (tier, a2) => `<g><polygon points="${pts(eye)}" fill="${tier.light}"/>${pulse(a2, 1, 0.3, 2)}</g>`,
      };
    },
  ];

  /**
   * @param {number} tierIndex
   * @param {boolean} animated
   * @returns {{shapes:string, under:(tier:object, animated:boolean)=>string}}
   */
  function emblem(tierIndex, animated) {
    const draw = EMBLEMS[Math.max(0, Math.min(EMBLEMS.length - 1, tierIndex))];
    const out = draw(Boolean(animated));
    return { shapes: out.shapes, under: out.under || (() => '') };
  }

  const api = { emblem, COUNT: EMBLEMS.length };
  root.TT = Object.assign(root.TT || {}, { emblems: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
