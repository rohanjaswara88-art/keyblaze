import { useMemo } from 'react';

/* A katana drawn in code, as separate parts so it can come apart.
   Sword coordinates: the pommel is at x = 0, the tip at x = 1220, the sword lies along the x axis centred on y = 0.
   Parts: kashira 0-46 · tsuka 46-372 · fuchi 372-392 · tsuba 392-414 · seppa 414-424 · habaki 424-470 · blade 470-1220.

   Realism comes from material, not outline: the blade is built from separate faces (spine, ridge face, body, edge)
   with a fine forging grain, long polished reflections and a soft temper line; the handle is shaded as a cylinder with a
   real over-under braid and pearly ray-skin nodules; the metal parts carry bevels, hammering and engraving. */

export const ORIGIN_X = 610;          // the middle of the sword
const BL = { x0: 470, len: 750, sori: 24 };
const yc = (t) => -BL.sori * t * t;                                         // the blade curves up toward the tip
const taper = (t) => (t < 0.92 ? 1 : Math.max(0, 1 - Math.pow((t - 0.92) / 0.08, 1.6)));
const hwT = (t) => (22 - 10 * t) * taper(t);                                // half width above the centreline (the spine)
const hwB = (t) => (22 - 11.5 * t) * taper(Math.min(1, t + 0.012));         // half width below (the cutting edge)

const f = (n) => Math.round(n * 100) / 100;
const pts = (a) => a.map((p) => f(p[0]) + ',' + f(p[1])).join(' L');
const band = (upper, lower) => 'M' + pts(upper) + ' L' + pts(lower.slice().reverse()) + ' Z';

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

/* one cherry-blossom petal pointing up, with a notched tip, scaled by r */
const petal = (r) => `M0,0 C${f(-0.55 * r)},${f(-0.2 * r)} ${f(-0.8 * r)},${f(-0.95 * r)} ${f(-0.3 * r)},${f(-1.16 * r)} Q${f(-0.08 * r)},${f(-1.02 * r)} 0,${f(-1.07 * r)} Q${f(0.08 * r)},${f(-1.02 * r)} ${f(0.3 * r)},${f(-1.16 * r)} C${f(0.8 * r)},${f(-0.95 * r)} ${f(0.55 * r)},${f(-0.2 * r)} 0,0 Z`;

function spiral(cx, cy, r0, turns, rot) {
  const out = [];
  for (let a = 0; a <= turns * Math.PI * 2; a += 0.25) {
    const r = r0 * (a / (turns * Math.PI * 2));
    out.push([cx + r * Math.cos(a + rot), cy + r * 0.8 * Math.sin(a + rot)]);
  }
  return 'M' + pts(out);
}

const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function build() {
  const N = 280, top = [], bot = [], spine = [], sh = [], hm = [], nie = [];
  const rand = rng(5);
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = BL.x0 + BL.len * t, yt = yc(t) - hwT(t), yb = yc(t) + hwB(t), k = taper(t);
    top.push([x, yt]); bot.push([x, yb]);
    spine.push([x, yt + 3.4 * k]);
    sh.push([x, yt + 0.36 * (yb - yt)]);
    const env = smooth01(0, 0.07, t) * (1 - 0.55 * smooth01(0.9, 1, t));
    const yh = yc(t) + hwB(t) * (0.5 + env * (0.15 * Math.sin(t * 52) + 0.07 * Math.sin(t * 127 + 1.1) + 0.025 * Math.sin(t * 331 + 0.4)));
    hm.push([x, yh]);
    if (i > 8 && i < N - 4 && rand() > 0.62) nie.push([x + (rand() - 0.5) * 6, yh + (rand() - 0.6) * 3.5, 0.45 + rand() * 0.5, 0.4 + rand() * 0.55]);
  }
  const bladePath = 'M' + pts(top) + ' L' + pts(bot.slice().reverse()) + ' Z';
  const faces = {
    spine: band(top, spine),
    shin: band(spine, sh),
    ji: band(sh, hm),
    ha: band(hm, bot)
  };
  // soft temper line: the same boundary pushed up in small steps, each fainter
  const soft = [1, 2, 3, 4].map((k) => band(hm.map((p) => [p[0], p[1] - k * 1.15]), bot));
  const hamLine = 'M' + pts(hm.slice(10, N - 4));
  const edge = 'M' + pts(bot.slice(8, N - 3));
  const ridge = 'M' + pts(sh.slice(8, N - 12));
  const groove = 'M' + pts(sh.slice(8, Math.floor(N * 0.8)).map((p, i) => [p[0], spine[i + 8][1] + 0.5 * (p[1] - spine[i + 8][1])]));

  const hs = [];
  for (let i = 0; i <= 28; i++) { const t = i / 28; hs.push(21 + 2.8 * Math.sin(Math.PI * t) - 1.4 * t); }
  const hx = (i) => 46 + (326 * i) / 28;
  const handle = 'M' + pts(hs.map((h, i) => [hx(i), -h])) + ' L' + pts(hs.map((h, i) => [hx(i), h]).reverse()) + ' Z';

  const P = 42, A = [], B = [], cross = [], diamonds = [];
  for (let xi = 24; xi < 380; xi += P) {
    A.push(`M${xi},-28 L${f(xi + 1.3 * P)},28`); B.push(`M${f(xi + 1.3 * P)},-28 L${xi},28`);
    cross.push(f(xi + 0.65 * P)); diamonds.push(f(xi + 0.65 * P + P / 2));
  }

  /* blossoms along the blade */
  const r2 = rng(11), flowers = [];
  let tries = 0;
  while (flowers.length < 22 && tries < 600) {
    tries++;
    const t = 0.1 + r2() * 0.7, x = BL.x0 + BL.len * t;
    const spread = 26 + 96 * Math.sin(Math.PI * Math.min(1, (t - 0.06) / 0.76));
    const r = 15 + r2() * 17, y = yc(t) + (r2() - 0.5) * 2 * spread * 0.95 - 8;
    if (flowers.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.78)) continue;
    flowers.push({ x, y, r, rot: r2() * 72, flat: 0.78 + r2() * 0.22, seed: flowers.length + 3 });
  }
  const buds = [];
  for (let i = 0; i < 11; i++) { const t = 0.06 + r2() * 0.76; buds.push({ x: BL.x0 + BL.len * t, y: yc(t) + (r2() - 0.5) * 150, r: 6 + r2() * 6, rot: r2() * 360 }); }
  const loose = [];
  for (let i = 0; i < 9; i++) { const t = 0.55 + r2() * 0.4; loose.push({ x: BL.x0 + BL.len * t, y: yc(t) + (r2() - 0.35) * 130, r: 7 + r2() * 5, rot: r2() * 360, sq: 0.45 + r2() * 0.4 }); }

  return { bladePath, faces, soft, hamLine, edge, ridge, groove, nie, handle, A, B, cross, diamonds, flowers, buds, loose };
}

function Flower({ x, y, r, rot, flat, seed }) {
  const rand = rng(seed * 977);
  const petals = [0, 1, 2, 3, 4].map((k) => ({ k, jr: (rand() - 0.5) * 9, s: 0.92 + rand() * 0.16 }));
  return (
    <g transform={`translate(${f(x)} ${f(y)})`}>
      <ellipse cx={f(r * 0.18)} cy={f(r * 0.3)} rx={f(r * 1.05)} ry={f(r * 0.85)} fill="#000" opacity="0.32" />
      <g transform={`rotate(${f(rot)}) scale(1 ${f(flat)})`}>
        {petals.map(({ k, jr, s }) => (
          <g key={k} transform={`rotate(${k * 72 + jr}) scale(${f(s)})`}>
            <path d={petal(r)} transform="translate(0 1.2)" fill="#5b3f3f" opacity="0.22" />
            <path d={petal(r)} fill="url(#petalBody)" stroke="#d6bdb7" strokeWidth="0.5" strokeLinejoin="round" />
            <path d={`M0,${f(-0.2 * r)} L${f(-0.12 * r)},${f(-0.84 * r)} M0,${f(-0.2 * r)} L0,${f(-0.98 * r)} M0,${f(-0.2 * r)} L${f(0.12 * r)},${f(-0.84 * r)}`} fill="none" stroke="#dcb8b6" strokeWidth="0.4" opacity="0.75" />
            <path d={`M${f(-0.3 * r)},${f(-1.12 * r)} Q0,${f(-0.97 * r)} ${f(0.3 * r)},${f(-1.12 * r)}`} fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.7" />
          </g>
        ))}
        <circle r={f(r * 0.26)} fill="url(#pistil)" />
        {Array.from({ length: 12 }, (_, k) => {
          const a = (k * 30 + rand() * 14) * Math.PI / 180, len = r * (0.42 + rand() * 0.16);
          return (
            <g key={k}>
              <path d={`M0,0 L${f(Math.sin(a) * len)},${f(-Math.cos(a) * len)}`} stroke="#d08a96" strokeWidth="0.45" />
              <circle cx={f(Math.sin(a) * len)} cy={f(-Math.cos(a) * len)} r={f(r * 0.055)} fill="#e0b95a" stroke="#9a6a2c" strokeWidth="0.25" />
            </g>
          );
        })}
      </g>
    </g>
  );
}

export default function Katana({ reg }) {
  const g = useMemo(build, []);
  const set = (key) => (el) => { reg[key] = el; };
  return (
    <>
      <defs>
        {/* blade faces */}
        <linearGradient id="gSpine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8d8a84" /><stop offset="1" stopColor="#c8c3b6" /></linearGradient>
        <linearGradient id="gShin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f2f36" /><stop offset="0.55" stopColor="#5a5a63" /><stop offset="0.9" stopColor="#a7a7b0" /><stop offset="1" stopColor="#ddd8ca" />
        </linearGradient>
        <linearGradient id="gJi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#15151a" /><stop offset="0.35" stopColor="#2b2b32" /><stop offset="0.8" stopColor="#53535c" /><stop offset="1" stopColor="#7d7d86" />
        </linearGradient>
        <linearGradient id="gHa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9d3c3" /><stop offset="0.35" stopColor="#f3eee0" /><stop offset="0.85" stopColor="#fffdf6" /><stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="gSheen" gradientUnits="userSpaceOnUse" x1="470" y1="0" x2="1220" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="0.1" stopColor="#fff" stopOpacity="0" /><stop offset="0.15" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.21" stopColor="#fff" stopOpacity="0" /><stop offset="0.38" stopColor="#fff" stopOpacity="0" /><stop offset="0.43" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" /><stop offset="0.68" stopColor="#fff" stopOpacity="0" /><stop offset="0.745" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.82" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gShade" gradientUnits="userSpaceOnUse" x1="470" y1="0" x2="1220" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" /><stop offset="0.18" stopColor="#000" stopOpacity="0.12" /><stop offset="0.6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
        <pattern id="hada" width="64" height="7" patternUnits="userSpaceOnUse">
          <path d="M0,3.5 Q16,0.5 32,3.5 T64,3.5" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.11" />
          <path d="M0,6.5 Q20,4 40,6.5 T80,6.5" fill="none" stroke="#000" strokeWidth="0.5" opacity="0.18" />
        </pattern>
        <clipPath id="bladeClip"><path d={g.bladePath} /></clipPath>

        {/* handle */}
        <linearGradient id="gCyl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.62" /><stop offset="0.22" stopColor="#000" stopOpacity="0.1" /><stop offset="0.42" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0.04" /><stop offset="1" stopColor="#000" stopOpacity="0.66" />
        </linearGradient>
        <linearGradient id="gBraid" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1c1c21" /><stop offset="0.5" stopColor="#35353c" /><stop offset="1" stopColor="#1c1c21" /></linearGradient>
        <radialGradient id="gNodule" cx="0.38" cy="0.34" r="0.75"><stop offset="0" stopColor="#ffffff" /><stop offset="0.55" stopColor="#e4dccb" /><stop offset="1" stopColor="#a39a86" /></radialGradient>
        <pattern id="rayskin" width="4.4" height="4.4" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="0.9" fill="#fff" opacity="0.55" /><circle cx="3.4" cy="3.4" r="0.8" fill="#8f8671" opacity="0.5" /><circle cx="1.2" cy="1.2" r="0.5" fill="#cfc5af" opacity="0.7" />
        </pattern>
        <clipPath id="tsukaClip"><path d={g.handle} /></clipPath>

        {/* metals */}
        <linearGradient id="hornGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbf6e8" /><stop offset="0.35" stopColor="#ebe2cb" /><stop offset="0.7" stopColor="#cabfa4" /><stop offset="1" stopColor="#a69a80" /></linearGradient>
        <linearGradient id="ironGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b5b64" /><stop offset="0.3" stopColor="#2d2d33" /><stop offset="0.7" stopColor="#1a1a1f" /><stop offset="1" stopColor="#0e0e11" /></linearGradient>
        <linearGradient id="habakiGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4d0" /><stop offset="0.18" stopColor="#e9d49a" /><stop offset="0.5" stopColor="#bfa264" /><stop offset="0.82" stopColor="#8e7746" /><stop offset="1" stopColor="#5f4f2d" />
        </linearGradient>
        <radialGradient id="tsubaGrad" cx="0.36" cy="0.3" r="0.9"><stop offset="0" stopColor="#5e5e68" /><stop offset="0.45" stopColor="#2e2e35" /><stop offset="1" stopColor="#0f0f12" /></radialGradient>
        <linearGradient id="mimiGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#d8d3c6" /><stop offset="0.4" stopColor="#6b6b74" /><stop offset="0.7" stopColor="#25252b" /><stop offset="1" stopColor="#9a968a" /></linearGradient>
        <pattern id="hammer" width="9" height="9" patternUnits="userSpaceOnUse">
          <path d="M1,3 Q3,0.5 5,3" fill="none" stroke="#000" strokeWidth="0.7" opacity="0.4" /><path d="M5,8 Q7,5.5 9,8" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.12" />
          <path d="M-2,7 Q0,4.5 2,7" fill="none" stroke="#000" strokeWidth="0.6" opacity="0.32" />
        </pattern>
        <pattern id="waves" width="8" height="5" patternUnits="userSpaceOnUse"><path d="M0,5 Q4,-1 8,5" fill="none" stroke="#efe8d8" strokeWidth="0.55" opacity="0.5" /></pattern>

        {/* blossoms */}
        <radialGradient id="petalBody" cx="0.5" cy="1" r="1.05">
          <stop offset="0" stopColor="#e3a9b2" /><stop offset="0.3" stopColor="#f3d8d8" /><stop offset="0.65" stopColor="#fcf1ed" /><stop offset="1" stopColor="#fffdfa" />
        </radialGradient>
        <radialGradient id="pistil"><stop offset="0" stopColor="#c2516a" /><stop offset="0.6" stopColor="#7a2c3b" /><stop offset="1" stopColor="#7a2c3b" stopOpacity="0" /></radialGradient>
        <linearGradient id="barkGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a4038" /><stop offset="1" stopColor="#1a1714" /></linearGradient>
      </defs>

      <g ref={set('sword')}>
        {/* kashira: polished horn with grain, a metal cord ring and a twisted crimson tassel */}
        <g ref={set('kashira')}>
          <path d="M0,-17 Q0,-24 9,-24.5 L38,-23.5 L46,-21.5 L46,21.5 L38,23.5 L9,24.5 Q0,24 0,17 Z" fill="url(#hornGrad)" stroke="#141418" strokeWidth="1.3" />
          <g fill="none" stroke="#a8946c" strokeWidth="0.6" opacity="0.5">
            <path d="M3,-12 Q22,-16 44,-11 M3,-5 Q22,-9 44,-4 M3,3 Q22,-1 44,4 M3,10 Q22,6 44,11 M3,17 Q22,13 44,17" />
          </g>
          <path d="M5,-21 L38,-21.6" stroke="#fffdf4" strokeWidth="1.6" opacity="0.75" />
          <path d="M5,19 L38,20" stroke="#6f6249" strokeWidth="1" opacity="0.4" />
          <ellipse cx="38" cy="-14" rx="3" ry="7" fill="#fff" opacity="0.25" />
          <circle cx="16" cy="-12" r="5" fill="url(#ironGrad)" stroke="#0c0c0f" strokeWidth="1" />
          <circle cx="16" cy="-12" r="2" fill="#efe8d8" /><path d="M12.5,-14.5 A5,5 0 0 1 19,-16" fill="none" stroke="#fff" strokeWidth="0.8" opacity="0.7" />
          <g fill="none" strokeLinecap="round">
            <path d="M16,-8 C24,8 4,26 15,46" stroke="#6e1612" strokeWidth="3.6" />
            <path d="M16,-8 C24,8 4,26 15,46" stroke="#c0392b" strokeWidth="2.2" />
            <path d="M16,-8 C24,8 4,26 15,46" stroke="#e07a6c" strokeWidth="0.7" strokeDasharray="2 3" opacity="0.8" />
          </g>
          {[-4, -2.4, -0.8, 0.8, 2.4, 4].map((o, i) => <path key={i} d={`M${15 + o * 0.4},44 L${15 + o * 1.9},${68 + (i % 2) * 2}`} stroke={i % 2 ? '#a02a20' : '#d4493a'} strokeWidth="1.1" strokeLinecap="round" />)}
          <path d="M10,44 Q15,41 20,44 L19,50 Q15,52 11,50 Z" fill="#8a1f17" stroke="#4a0d09" strokeWidth="0.5" />
        </g>

        {/* tsuka: ray skin nodules, an over-under silk braid, two metal menuki, shaded as a cylinder */}
        <g ref={set('tsuka')}>
          <path d={g.handle} fill="#e9e1cd" />
          <path d={g.handle} fill="url(#rayskin)" />
          {g.diamonds.map((cx, i) => (
            <g key={i}>
              <circle cx={cx} cy={-6.5} r="3.5" fill="url(#gNodule)" stroke="#8f8671" strokeWidth="0.3" />
              <circle cx={cx} cy={6.5} r="3.5" fill="url(#gNodule)" stroke="#8f8671" strokeWidth="0.3" />
              <circle cx={cx - 8} cy={0} r="1.7" fill="url(#gNodule)" /><circle cx={cx + 8} cy={0} r="1.7" fill="url(#gNodule)" />
            </g>
          ))}
          <g clipPath="url(#tsukaClip)">
            <path d={g.B.join(' ')} stroke="#0c0c0f" strokeWidth="11" fill="none" opacity="0.55" transform="translate(1.2 1.6)" />
            <path d={g.B.join(' ')} stroke="url(#gBraid)" strokeWidth="9" fill="none" />
            <path d={g.B.join(' ')} stroke="#7b7b86" strokeWidth="1" fill="none" opacity="0.5" />
            <path d={g.A.join(' ')} stroke="#0c0c0f" strokeWidth="11.5" fill="none" opacity="0.6" transform="translate(1.4 1.8)" />
            <path d={g.A.join(' ')} stroke="url(#gBraid)" strokeWidth="9.4" fill="none" />
            <path d={g.A.join(' ')} stroke="#8d8d98" strokeWidth="1.3" fill="none" opacity="0.6" />
            <path d={g.A.join(' ')} stroke="#0a0a0c" strokeWidth="0.6" fill="none" strokeDasharray="1.5 2.2" opacity="0.6" transform="translate(2.4 0)" />
          </g>
          <path d={g.handle} fill="url(#gCyl)" />
          <path d={g.handle} fill="none" stroke="#101013" strokeWidth="1.4" />
          {[g.cross[2], g.cross[6]].map((cx, i) => (
            <g key={i} transform={`translate(${cx} ${i ? 1 : -1}) rotate(${i ? 20 : -10})`}>
              <ellipse cx="1.2" cy="2" rx="9" ry="8" fill="#000" opacity="0.4" />
              {[0, 1, 2, 3, 4].map((k) => <path key={k} transform={`rotate(${k * 72})`} d={petal(7)} fill="url(#habakiGrad)" stroke="#4d3f22" strokeWidth="0.6" />)}
              <circle r="2" fill="url(#ironGrad)" /><circle cx="-0.5" cy="-0.6" r="0.7" fill="#fff" opacity="0.8" />
            </g>
          ))}
        </g>

        {/* fuchi: iron collar with wave engraving and bevels */}
        <g ref={set('fuchi')}>
          <path d="M372,-24 L390,-25 Q392,-25 392,-23 L392,23 Q392,25 390,25 L372,24 Z" fill="url(#ironGrad)" stroke="#0a0a0d" strokeWidth="1.2" />
          <path d="M373,-22 L391,-23.4 L391,23.4 L373,22 Z" fill="url(#waves)" />
          <path d="M374,-23.5 L390,-24.2 M374,23.5 L390,24.2" stroke="#e9e3d5" strokeWidth="1" opacity="0.55" />
          <path d="M372,-24 L372,24 M391,-24 L391,24" stroke="#ffffff" strokeWidth="0.7" opacity="0.25" />
        </g>

        {/* tsuba: drawn face-on, squashed to a sliver when the sword is whole. Hammered iron, brass inlay, bevelled openings. */}
        <g ref={set('tsuba')}>
          <g transform="translate(403 0)">
            <g ref={set('tsubaFace')} transform="scale(0.18 1)">
              <circle r="66" fill="url(#tsubaGrad)" />
              <circle r="66" fill="url(#hammer)" />
              <circle r="65" fill="none" stroke="url(#mimiGrad)" strokeWidth="3.4" />
              <circle r="61" fill="none" stroke="#000" strokeWidth="1.2" opacity="0.55" />
              <circle r="58" fill="none" stroke="#d6b86a" strokeWidth="1" strokeDasharray="3.4 3" opacity="0.85" />
              {[0, 90, 180, 270].map((a) => (
                <g key={a} transform={`rotate(${a}) translate(0 -30)`}>
                  <path d={petal(14)} transform="translate(0 1.6)" fill="#fff" opacity="0.28" />
                  <path d={petal(14)} fill="#0c0c0f" stroke="#cfcabd" strokeWidth="1.1" />
                  <path d={petal(12)} fill="none" stroke="#000" strokeWidth="1.2" opacity="0.7" transform="translate(0 -0.5)" />
                </g>
              ))}
              <rect x="-6.5" y="-24" width="13" height="48" rx="6.5" fill="#0c0c0f" stroke="#e5dfd0" strokeWidth="1.3" />
              <rect x="-6.5" y="-24" width="13" height="48" rx="6.5" fill="none" stroke="#000" strokeWidth="1.2" opacity="0.6" transform="translate(0 0.9)" />
              {[[-42, -42], [42, -42], [-42, 42], [42, 42], [-48, 0], [48, 0]].map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill="url(#habakiGrad)" stroke="#3a2f18" strokeWidth="0.5" />)}
              <path d="M-40,-46 A60,60 0 0 1 8,-62" fill="none" stroke="#fff" strokeWidth="2" opacity="0.28" strokeLinecap="round" />
            </g>
          </g>
        </g>

        {/* seppa: two copper washers with a bevelled rim */}
        <g ref={set('seppa')}>
          <rect x="414" y="-34" width="4.4" height="68" rx="2.2" fill="url(#habakiGrad)" stroke="#2c2412" strokeWidth="0.9" />
          <rect x="419.2" y="-31" width="4.4" height="62" rx="2.2" fill="url(#habakiGrad)" stroke="#2c2412" strokeWidth="0.9" />
          <path d="M415.2,-31 L415.2,31 M420.4,-28 L420.4,28" stroke="#fff6d8" strokeWidth="0.7" opacity="0.6" />
        </g>

        {/* habaki: engraved gold collar */}
        <g ref={set('habaki')}>
          <path d="M424,-26 L466,-23 L470,-22 L470,22 L466,23 L424,26 Z" fill="url(#habakiGrad)" stroke="#2c2412" strokeWidth="1.2" />
          <g stroke="#3d3118" strokeWidth="0.6" opacity="0.6">{Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${428 + i * 3.1},-24.5 L${428 + i * 3.1},24.5`} />)}</g>
          <g stroke="#fff6d8" strokeWidth="0.5" opacity="0.55">{Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${429 + i * 3.1},-24.3 L${429 + i * 3.1},24.3`} />)}</g>
          <path d="M424,-26 L466,-23 L470,-22" fill="none" stroke="#fffbe8" strokeWidth="1.5" opacity="0.8" />
          <path d="M424,26 L466,23 L470,22" fill="none" stroke="#2c2412" strokeWidth="1.4" opacity="0.7" />
        </g>

        {/* blade: spine, ridge face, polished body with grain, soft temper line, razor edge, long reflections */}
        <g ref={set('blade')}>
          <path d={g.bladePath} fill="#17171c" />
          <g clipPath="url(#bladeClip)">
            <path d={g.faces.spine} fill="url(#gSpine)" />
            <path d={g.faces.shin} fill="url(#gShin)" />
            <path d={g.faces.ji} fill="url(#gJi)" />
            <path d={g.faces.ji} fill="url(#hada)" />
            {g.soft.map((d, i) => <path key={i} d={d} fill="#fffdf3" opacity={0.1 + i * 0.03} />)}
            <path d={g.faces.ha} fill="url(#gHa)" />
            <path d={g.ridge} fill="none" stroke="#fff" strokeWidth="1.3" opacity="0.7" />
            <path d={g.ridge} fill="none" stroke="#000" strokeWidth="1.6" opacity="0.4" transform="translate(0 1.4)" />
            <path d={g.groove} fill="none" stroke="#08080a" strokeWidth="3.2" opacity="0.6" strokeLinecap="round" />
            <path d={g.groove} fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.4" transform="translate(0 2.3)" strokeLinecap="round" />
            <path d={g.hamLine} fill="none" stroke="#fff" strokeWidth="1" opacity="0.75" />
            {g.nie.map((n, i) => <circle key={i} cx={f(n[0])} cy={f(n[1])} r={f(n[2])} fill="#fff" opacity={f(n[3])} />)}
            <path d={g.edge} fill="none" stroke="#fff" strokeWidth="1.1" opacity="0.95" />
            <rect x="470" y="-70" width="750" height="140" fill="url(#gShade)" />
            <rect x="470" y="-70" width="750" height="140" fill="url(#gSheen)" />
            <g fill="none" strokeLinecap="round">
              {[[500, -3, 11, 2.2, 0], [532, 2, 8, 1.8, 2], [560, -4, 9, 2, 4]].map((s, i) => (
                <g key={i}>
                  <path d={spiral(...s)} stroke="#000" strokeWidth="1.5" opacity="0.5" transform="translate(0.8 1)" />
                  <path d={spiral(...s)} stroke="#efe8d8" strokeWidth="0.9" opacity="0.55" />
                </g>
              ))}
            </g>
            <path d="M1166,-18 L1160,6" stroke="#fff" strokeWidth="0.9" opacity="0.5" />
          </g>
          <path d={g.bladePath} fill="none" stroke="#08080a" strokeWidth="1.3" strokeLinejoin="round" />

          <g ref={set('sakura')}>
            <g fill="none" strokeLinecap="round">
              <path d="M520,8 C610,-40 700,46 790,-8 S920,-50 1000,-84 M700,22 C720,46 744,56 780,50 M826,-16 C850,-44 888,-40 914,-20 M640,-20 C650,-48 676,-60 700,-56" stroke="#0e0c0a" strokeWidth="5.2" transform="translate(1.5 2.5)" opacity="0.5" />
              <path d="M520,8 C610,-40 700,46 790,-8 S920,-50 1000,-84 M700,22 C720,46 744,56 780,50 M826,-16 C850,-44 888,-40 914,-20 M640,-20 C650,-48 676,-60 700,-56" stroke="url(#barkGrad)" strokeWidth="4.4" />
              <path d="M520,6.5 C610,-41.5 700,44.5 790,-9.5 S920,-51.5 1000,-85.5" stroke="#8a7b6c" strokeWidth="0.9" opacity="0.5" />
            </g>
            {g.loose.map((l, i) => (
              <g key={'l' + i} transform={`translate(${f(l.x)} ${f(l.y)}) rotate(${f(l.rot)}) scale(1 ${l.sq})`}>
                <path d={petal(l.r)} transform="translate(1 2)" fill="#000" opacity="0.3" />
                <path d={petal(l.r)} fill="url(#petalBody)" stroke="#d6bdb7" strokeWidth="0.5" />
              </g>
            ))}
            {g.buds.map((b, i) => (
              <g key={'b' + i} transform={`translate(${f(b.x)} ${f(b.y)}) rotate(${f(b.rot)})`}>
                <ellipse cx="1" cy="2" rx={f(b.r * 0.9)} ry={f(b.r * 1.2)} fill="#000" opacity="0.3" />
                <path d={petal(b.r)} fill="url(#petalBody)" stroke="#d6bdb7" strokeWidth="0.5" />
                <circle r={f(b.r * 0.22)} fill="#6a3338" />
              </g>
            ))}
            {g.flowers.map((fl, i) => <Flower key={i} {...fl} />)}
          </g>
        </g>
      </g>
    </>
  );
}
