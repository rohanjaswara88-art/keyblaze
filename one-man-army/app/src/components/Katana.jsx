import { useMemo } from 'react';

/* A katana drawn in code, as separate parts so it can come apart.
   Sword coordinates: the pommel is at x = 0, the tip at x = 1220, the sword lies along the x axis centred on y = 0.
   Parts: kashira 0-46 · tsuka 46-372 · fuchi 372-392 · tsuba 392-414 · seppa 414-424 · habaki 424-470 · blade 470-1220. */

export const ORIGIN_X = 610;          // the middle of the sword
const BL = { x0: 470, len: 750, sori: 24 };
const yc = (t) => -BL.sori * t * t;                                         // the blade curves up toward the tip
const taper = (t) => (t < 0.92 ? 1 : Math.max(0, 1 - Math.pow((t - 0.92) / 0.08, 1.6)));
const hwT = (t) => (22 - 10 * t) * taper(t);                                 // half width above the centreline (the spine)
const hwB = (t) => (22 - 11.5 * t) * taper(Math.min(1, t + 0.012));            // half width below (the cutting edge)

const f = (n) => Math.round(n * 100) / 100;
const pts = (a) => a.map((p) => f(p[0]) + ',' + f(p[1])).join(' L');

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/* one cherry-blossom petal pointing up, scaled by r */
const petal = (r) => `M0,0 C${f(-0.55 * r)},${f(-0.2 * r)} ${f(-0.78 * r)},${f(-0.95 * r)} ${f(-0.28 * r)},${f(-1.15 * r)} Q0,${f(-0.98 * r)} ${f(0.28 * r)},${f(-1.15 * r)} C${f(0.78 * r)},${f(-0.95 * r)} ${f(0.55 * r)},${f(-0.2 * r)} 0,0 Z`;

function spiral(cx, cy, r0, turns, rot) {
  const out = [];
  for (let a = 0; a <= turns * Math.PI * 2; a += 0.25) {
    const r = r0 * (a / (turns * Math.PI * 2));
    out.push([cx + r * Math.cos(a + rot), cy + r * 0.8 * Math.sin(a + rot)]);
  }
  return 'M' + pts(out);
}

function build() {
  const N = 64, top = [], bot = [];
  for (let i = 0; i <= N; i++) { const t = i / N, x = BL.x0 + BL.len * t; top.push([x, yc(t) - hwT(t)]); bot.push([x, yc(t) + hwB(t)]); }
  const bladePath = 'M' + pts(top) + ' L' + pts(bot.slice().reverse()) + ' Z';

  const ham = [];
  for (let i = 3; i <= N - 2; i++) { const t = i / N; ham.push([BL.x0 + BL.len * t, yc(t) + hwB(t) * (0.5 + 0.16 * Math.sin(t * 52) + 0.08 * Math.sin(t * 127 + 1.1))]); }
  const hamFill = 'M' + pts(ham) + ' L' + pts(bot.slice(3, N - 1).reverse()) + ' Z';
  const hamLine = 'M' + pts(ham);

  const shin = [], boHi = [];
  for (let i = 2; i <= N - 4; i++) { const t = i / N, x = BL.x0 + BL.len * t; shin.push([x, yc(t) - hwT(t) * 0.12]); if (t < 0.78) boHi.push([x, yc(t) - hwT(t) * 0.56]); }
  const shinogi = 'M' + pts(shin), fuller = 'M' + pts(boHi);

  const hs = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; hs.push(21 + 2.8 * Math.sin(Math.PI * t) - 1.4 * t); }
  const hx = (i) => 46 + (326 * i) / 24;
  const handle = 'M' + pts(hs.map((h, i) => [hx(i), -h])) + ' L' + pts(hs.map((h, i) => [hx(i), h]).reverse()) + ' Z';

  const P = 42, A = [], B = [], cross = [];
  for (let xi = 24; xi < 380; xi += P) { A.push(`M${xi},-27 L${f(xi + 1.3 * P)},27`); B.push(`M${f(xi + 1.3 * P)},-27 L${xi},27`); cross.push(f(xi + 0.65 * P)); }

  /* blossoms along the blade, like the reference: a dark branch and a cluster of flowers */
  const rand = rng(11), flowers = [];
  let tries = 0;
  while (flowers.length < 22 && tries < 600) {
    tries++;
    const t = 0.1 + rand() * 0.7, x = BL.x0 + BL.len * t;
    const spread = 26 + 96 * Math.sin(Math.PI * Math.min(1, (t - 0.06) / 0.76));
    const r = 15 + rand() * 17, y = yc(t) + (rand() - 0.5) * 2 * spread * 0.95 - 8;
    if (flowers.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.78)) continue;
    flowers.push({ x, y, r, rot: rand() * 72 });
  }
  const buds = [];
  for (let i = 0; i < 11; i++) { const t = 0.06 + rand() * 0.76; buds.push({ x: BL.x0 + BL.len * t, y: yc(t) + (rand() - 0.5) * 150, r: 6 + rand() * 6, rot: rand() * 360 }); }

  return { bladePath, hamFill, hamLine, shinogi, fuller, handle, A, B, cross, flowers, buds };
}

function Flower({ x, y, r, rot }) {
  return (
    <g transform={`translate(${f(x)} ${f(y)}) rotate(${f(rot)})`}>
      {[0, 1, 2, 3, 4].map((k) => (
        <g key={k} transform={`rotate(${k * 72})`}>
          <path d={petal(r)} fill="url(#petalGrad)" stroke="#2a2a30" strokeWidth="0.6" strokeOpacity="0.55" strokeLinejoin="round" />
          <path d={`M0,${f(-0.14 * r)} L0,${f(-0.74 * r)}`} stroke="#b8ad95" strokeWidth="0.5" opacity="0.7" />
        </g>
      ))}
      <circle r={f(r * 0.17)} fill="#2e2e35" />
      {[0, 1, 2, 3, 4, 5, 6].map((k) => (
        <g key={k} transform={`rotate(${k * 51 + 12})`}>
          <path d={`M0,0 L0,${f(-0.46 * r)}`} stroke="#b3261e" strokeWidth="0.55" />
          <circle cy={f(-0.46 * r)} r={f(r * 0.05)} fill="#b3261e" />
        </g>
      ))}
    </g>
  );
}

export default function Katana({ reg }) {
  const g = useMemo(build, []);
  const set = (key) => (el) => { reg[key] = el; };
  return (
    <>
      <defs>
        <linearGradient id="bladeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#202026" /><stop offset="0.34" stopColor="#47474f" /><stop offset="0.54" stopColor="#8d8d96" />
          <stop offset="0.74" stopColor="#cfc9b9" /><stop offset="1" stopColor="#f3eddf" />
        </linearGradient>
        <linearGradient id="hamGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efe8d8" stopOpacity="0.95" /><stop offset="1" stopColor="#fbf6ea" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="hornGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4eedf" /><stop offset="0.55" stopColor="#dcd3bd" /><stop offset="1" stopColor="#b9ae95" />
        </linearGradient>
        <linearGradient id="ironGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a42" /><stop offset="0.5" stopColor="#25252b" /><stop offset="1" stopColor="#141418" />
        </linearGradient>
        <linearGradient id="habakiGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1e6c6" /><stop offset="0.5" stopColor="#d6c391" /><stop offset="1" stopColor="#a8946a" />
        </linearGradient>
        <radialGradient id="petalGrad" cx="0.5" cy="0.9" r="0.95">
          <stop offset="0" stopColor="#e9d9d0" /><stop offset="0.5" stopColor="#f7f1e6" /><stop offset="1" stopColor="#fffdf7" />
        </radialGradient>
        <radialGradient id="tsubaGrad" cx="0.4" cy="0.35" r="0.85">
          <stop offset="0" stopColor="#47474f" /><stop offset="0.6" stopColor="#25252b" /><stop offset="1" stopColor="#121216" />
        </radialGradient>
        <pattern id="rayskin" width="5" height="5" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="0.85" fill="#1b1b1f" opacity="0.32" /><circle cx="3.9" cy="3.9" r="0.7" fill="#1b1b1f" opacity="0.26" />
        </pattern>
        <clipPath id="tsukaClip"><path d={g.handle} /></clipPath>
      </defs>

      <g ref={set('sword')}>
        {/* kashira: pommel cap with a cord ring and a crimson tassel */}
        <g ref={set('kashira')}>
          <path d="M0,-17 Q0,-24 9,-24.5 L38,-23.5 L46,-21.5 L46,21.5 L38,23.5 L9,24.5 Q0,24 0,17 Z" fill="url(#hornGrad)" stroke="#16161a" strokeWidth="1.3" />
          <path d="M6,-19 L38,-19.5" stroke="#fffdf4" strokeWidth="1.4" opacity="0.7" />
          <path d="M5,0 L44,0" stroke="#16161a" strokeWidth="0.7" opacity="0.35" />
          <circle cx="16" cy="-12" r="4" fill="#25252b" stroke="#16161a" strokeWidth="1" />
          <circle cx="16" cy="-12" r="1.7" fill="#efe8d8" />
          <path d="M16,-8 C24,8 4,26 15,46" fill="none" stroke="#b3261e" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M11,44 L15,66 L19,44 Z" fill="#b3261e" />
        </g>

        {/* tsuka: ray skin, silk braid in a diamond lattice, two menuki */}
        <g ref={set('tsuka')}>
          <path d={g.handle} fill="#ebe3d0" />
          <path d={g.handle} fill="url(#rayskin)" />
          <g clipPath="url(#tsukaClip)">
            <path d={g.A.join(' ')} stroke="#2a2a30" strokeWidth="9" fill="none" />
            <path d={g.B.join(' ')} stroke="#2a2a30" strokeWidth="9" fill="none" />
            <path d={g.A.join(' ')} stroke="#6b6b75" strokeWidth="1" fill="none" opacity="0.55" />
            <path d={g.B.join(' ')} stroke="#6b6b75" strokeWidth="1" fill="none" opacity="0.55" />
            <path d={`M46,-17 L372,-17 M46,17 L372,17`} stroke="#fff9ea" strokeWidth="1" opacity="0.22" />
          </g>
          <path d={g.handle} fill="none" stroke="#16161a" strokeWidth="1.4" />
          {[g.cross[2], g.cross[6]].map((cx, i) => (
            <g key={i} transform={`translate(${cx} ${i ? 1 : -1}) rotate(${i ? 20 : -10})`}>
              {[0, 1, 2, 3, 4].map((k) => <path key={k} transform={`rotate(${k * 72})`} d={petal(6.5)} fill="#efe6d0" stroke="#1b1b1f" strokeWidth="0.7" />)}
              <circle r="1.6" fill="#1b1b1f" />
            </g>
          ))}
        </g>

        {/* fuchi: collar */}
        <g ref={set('fuchi')}>
          <path d="M372,-24 L390,-25 Q392,-25 392,-23 L392,23 Q392,25 390,25 L372,24 Z" fill="url(#ironGrad)" stroke="#0f0f12" strokeWidth="1.2" />
          <path d="M376,-21 L388,-21.5 M376,21 L388,21.5 M382,-22 L382,22" stroke="#efe8d8" strokeWidth="0.7" opacity="0.45" />
        </g>

        {/* tsuba: drawn face-on, squashed to a sliver when the sword is whole */}
        <g ref={set('tsuba')}>
          <g transform="translate(403 0)">
            <g ref={set('tsubaFace')} transform="scale(0.18 1)">
              <circle r="62" fill="url(#tsubaGrad)" stroke="#efe8d8" strokeWidth="1.4" strokeOpacity="0.5" />
              <circle r="56" fill="none" stroke="#efe8d8" strokeWidth="0.9" strokeDasharray="4 3" opacity="0.5" />
              {[0, 90, 180, 270].map((a) => (
                <g key={a} transform={`rotate(${a}) translate(0 -30)`}>
                  <path d={petal(13)} fill="#1b1b1f" stroke="#efe8d8" strokeWidth="0.9" strokeOpacity="0.6" />
                </g>
              ))}
              <rect x="-6" y="-23" width="12" height="46" rx="6" fill="#1b1b1f" stroke="#efe8d8" strokeWidth="1.1" strokeOpacity="0.7" />
              {[[-42, -42], [42, -42], [-42, 42], [42, 42]].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.8" fill="#efe8d8" opacity="0.55" />)}
            </g>
          </g>
        </g>

        {/* seppa: copper washers either side of the guard */}
        <g ref={set('seppa')}>
          <rect x="414" y="-33" width="4" height="66" rx="2" fill="url(#habakiGrad)" stroke="#16161a" strokeWidth="0.9" />
          <rect x="419" y="-30" width="4" height="60" rx="2" fill="url(#habakiGrad)" stroke="#16161a" strokeWidth="0.9" />
        </g>

        {/* habaki: blade collar */}
        <g ref={set('habaki')}>
          <path d="M424,-26 L466,-23 L470,-22 L470,22 L466,23 L424,26 Z" fill="url(#habakiGrad)" stroke="#16161a" strokeWidth="1.2" />
          <path d="M434,-24 L434,24 M444,-23.4 L444,23.4 M454,-22.8 L454,22.8" stroke="#fff6d8" strokeWidth="0.8" opacity="0.5" />
          <path d="M427,-21 L465,-19" stroke="#fff6d8" strokeWidth="1.2" opacity="0.6" />
        </g>

        {/* blade, with the temper line and a few engraved clouds; the blossoms ride on it */}
        <g ref={set('blade')}>
          <path d={g.bladePath} fill="url(#bladeGrad)" stroke="#101013" strokeWidth="1.3" strokeLinejoin="round" />
          <path d={g.hamFill} fill="url(#hamGrad)" opacity="0.92" />
          <path d={g.hamLine} fill="none" stroke="#ffffff" strokeWidth="1.1" opacity="0.8" />
          <path d={g.shinogi} fill="none" stroke="#efe8d8" strokeWidth="1.2" opacity="0.55" />
          <path d={g.fuller} fill="none" stroke="#111114" strokeWidth="2.6" opacity="0.5" strokeLinecap="round" />
          <path d={g.fuller} fill="none" stroke="#efe8d8" strokeWidth="0.7" opacity="0.35" transform="translate(0 2.2)" strokeLinecap="round" />
          <g fill="none" stroke="#efe8d8" strokeWidth="1" opacity="0.4" strokeLinecap="round">
            <path d={spiral(500, -3, 11, 2.2, 0)} /><path d={spiral(532, 2, 8, 1.8, 2)} /><path d={spiral(560, -4, 9, 2, 4)} />
          </g>
          <path d="M1166,-18 L1160,6" stroke="#efe8d8" strokeWidth="0.9" opacity="0.5" />

          <g ref={set('sakura')}>
            <path d="M520,8 C610,-40 700,46 790,-8 S920,-50 1000,-84 M700,22 C720,46 744,56 780,50 M826,-16 C850,-44 888,-40 914,-20 M640,-20 C650,-48 676,-60 700,-56" fill="none" stroke="#1d1d22" strokeWidth="4" strokeLinecap="round" />
            {g.buds.map((b, i) => (
              <g key={'b' + i} transform={`translate(${f(b.x)} ${f(b.y)}) rotate(${f(b.rot)})`}>
                <path d={petal(b.r)} fill="url(#petalGrad)" stroke="#2a2a30" strokeWidth="0.5" strokeOpacity="0.5" />
              </g>
            ))}
            {g.flowers.map((fl, i) => <Flower key={i} {...fl} />)}
          </g>
        </g>
      </g>
    </>
  );
}
