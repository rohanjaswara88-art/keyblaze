import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Katana, { ORIGIN_X } from './Katana';
import SplitText from './rb/SplitText/SplitText';
import ShinyText from './rb/ShinyText';
import DecryptedText from './rb/DecryptedText/DecryptedText';
import { PARTS, HERO, OUTRO } from '../data/parts';
import { reduceMotion } from '../lib/anim';

const D2R = Math.PI / 180;
/* how far each group slides along the blade when the sword comes apart */
const GROUP_DX = { kashira: -210, tsuka: -140, fuchi: -70, tsuba: 0, seppa: 70, habaki: 120, blade: 240 };
const FS = 0.27, SEG = 0.085;               // the zoom-in tour starts at 27% of the scroll, 8.5% per part

/* where a point of the sword (sword coordinates) is on the stage right now */
function toStage(S, qx, qy) {
  const a = S.rot * D2R, c = Math.cos(a), s = Math.sin(a), dx = (qx - ORIGIN_X) * S.s, dy = qy * S.s;
  return [S.x + dx * c - dy * s, S.y + dx * s + dy * c];
}
/* where to put the sword so that sword point (ax, ay) lands at screen point (tx, ty) */
function camFor(ax, ay, s, rot, tx, ty) {
  const a = rot * D2R, c = Math.cos(a), si = Math.sin(a), dx = (ax - ORIGIN_X) * s, dy = ay * s;
  return { rot, s, x: tx - (dx * c - dy * si), y: ty - (dx * si + dy * c) };
}

function poses(W, H) {
  const land = W / H > 0.95;
  if (land) {
    const r = 27 * D2R;
    const sh = Math.min((0.74 * W) / (1220 * Math.cos(r) + 40), (0.66 * H) / (1220 * Math.sin(r) + 60));
    return { land, hero: { rot: -27, s: sh, x: W * 0.55, y: H * 0.47 }, over: { rot: 0, s: (0.88 * W) / 1670, x: W * 0.5, y: H * 0.52 }, focusAt: [W * 0.34, H * 0.5], focusRot: 0 };
  }
  const r = 62 * D2R;
  const sh = Math.min((0.9 * W) / (1220 * Math.cos(r) + 40), (0.7 * H) / (1220 * Math.sin(r) + 60));
  return { land, hero: { rot: -62, s: sh, x: W * 0.5, y: H * 0.56 }, over: { rot: -90, s: Math.min((0.84 * H) / 1670, 0.5 * W / 80), x: W * 0.4, y: H * 0.5 }, focusAt: [W * 0.5, H * 0.34], focusRot: -90 };
}

export default function Showcase({ revealed }) {
  const stage = useRef(null), svg = useRef(null), leaders = useRef(null), heroBack = useRef(null), heroFront = useRef(null), outro = useRef(null);
  const reg = useRef({}).current, labs = useRef([]), lines = useRef([]);
  const [active, setActive] = useState(-1);

  useLayoutEffect(() => {
    const reduce = reduceMotion();
    const S = { x: 0, y: 0, rot: -27, s: 1, ex: 0, face: 0.18, sak: 1, hero: 1, lab: 0, fm: 0, fin: 0 };
    const op = {};                         // smoothed opacity per part group
    let W = 1, H = 1, tl = null, activeNow = -1;

    function apply() {
      if (!reg.sword) return;
      reg.sword.setAttribute('transform', `translate(${S.x} ${S.y}) rotate(${S.rot}) scale(${S.s}) translate(${-ORIGIN_X} 0)`);
      Object.keys(GROUP_DX).forEach((k) => {
        const el = reg[k]; if (!el) return;
        el.setAttribute('transform', `translate(${GROUP_DX[k] * S.ex} 0)`);
        const on = activeNow >= 0 && PARTS[activeNow].groups.includes(k);
        const target = 1 - S.fm * (on ? 0 : 0.9);
        op[k] = op[k] === undefined ? target : op[k] + (target - op[k]) * 0.25;
        el.setAttribute('opacity', op[k].toFixed(3));
      });
      reg.tsubaFace.setAttribute('transform', `scale(${(0.18 + 0.82 * S.face).toFixed(3)} 1)`);
      reg.sakura.setAttribute('opacity', S.sak.toFixed(3));

      const off = Math.max(70, H * 0.15);
      PARTS.forEach((p, i) => {
        const el = labs.current[i], ln = lines.current[i];
        if (!el) return;
        const [px, py] = toStage(S, p.ax + (GROUP_DX[p.groups[0]] === undefined ? 0 : (p.id === 'hamon' ? GROUP_DX.blade : GROUP_DX[p.groups[0]])) * S.ex, p.ay);
        const up = p.side === 'up';
        const vertical = !stage.current.classList.contains('land');
        const lx = vertical ? px + (up ? -off * 0.9 : off * 0.9) : px, ly = vertical ? py : py + (up ? -off : off);
        el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px) translate(-50%, -50%)`;
        el.style.opacity = S.lab.toFixed(3);
        ln.setAttribute('x1', px.toFixed(1)); ln.setAttribute('y1', py.toFixed(1));
        ln.setAttribute('x2', lx.toFixed(1)); ln.setAttribute('y2', (vertical ? ly : ly + (up ? 22 : -22)).toFixed(1));
        ln.setAttribute('opacity', (S.lab * 0.7).toFixed(3));
      });

      [heroBack, heroFront].forEach((h) => {
        h.current.style.opacity = S.hero.toFixed(3);
        h.current.style.transform = `translateY(${(1 - S.hero) * -40}px)`;
      });
      outro.current.style.opacity = S.fin.toFixed(3);
      outro.current.style.transform = `translateY(${(1 - S.fin) * 24}px)`;

      if (tl) {
        const p = tl.progress();
        const idx = p < FS - 0.005 || p > FS + SEG * PARTS.length + 0.005 ? -1 : Math.min(PARTS.length - 1, Math.max(0, Math.floor((p - FS) / SEG)));
        if (idx !== activeNow) { activeNow = idx; setActive(idx); }
      }
    }

    function build() {
      if (tl) { tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); tl = null; }
      const r = stage.current.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      svg.current.setAttribute('viewBox', `0 0 ${W} ${H}`); leaders.current.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const P = poses(W, H);
      stage.current.classList.toggle('land', P.land);
      Object.assign(S, P.hero, { ex: 0, face: 0.18, sak: 1, hero: 1, lab: 0, fm: 0, fin: 0 });
      Object.keys(op).forEach((k) => delete op[k]);

      if (reduce) {                                   // no pinning: show the pulled-apart diagram and all callouts
        Object.assign(S, P.over, { ex: 1, face: 1, sak: 0, hero: 0, lab: 1 });
        apply();
        return;
      }

      const foc = PARTS.map((p) => {
        const ex = (p.id === 'hamon' ? GROUP_DX.blade : GROUP_DX[p.groups[0]]);
        const s = P.over.s * p.zoom * (P.land ? 1 : 0.72);
        return camFor(p.ax + ex, p.ay, s, P.focusRot, P.focusAt[0], P.focusAt[1]);
      });

      tl = gsap.timeline({
        defaults: { ease: 'none' },
        onUpdate: apply,
        scrollTrigger: { trigger: stage.current, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * 11), pin: true, scrub: 0.8, anticipatePin: 1 }
      });
      tl.to(S, { hero: 0, duration: 0.07, ease: 'power1.in' }, 0.04)
        .to(S, { rot: P.over.rot, s: P.over.s, x: P.over.x, y: P.over.y, duration: 0.14, ease: 'power2.inOut' }, 0.06)
        .to(S, { ex: 1, duration: 0.12, ease: 'power3.inOut' }, 0.1)
        .to(S, { face: 1, duration: 0.1, ease: 'power2.inOut' }, 0.12)
        .to(S, { sak: 0, duration: 0.08, ease: 'power1.in' }, 0.07)
        .to(S, { lab: 1, duration: 0.05 }, 0.21)
        .to(S, { lab: 0, duration: 0.025 }, 0.25)
        .to(S, { fm: 1, duration: 0.02 }, 0.26);
      foc.forEach((c, i) => tl.to(S, { rot: c.rot, s: c.s, x: c.x, y: c.y, duration: 0.04, ease: 'power2.inOut' }, FS + i * SEG));
      const end = FS + SEG * PARTS.length;                                          // 0.865
      tl.to(S, { fm: 0, duration: 0.02 }, end)
        .to(S, { rot: P.over.rot, s: P.over.s, x: P.over.x, y: P.over.y, duration: 0.05, ease: 'power2.inOut' }, end)
        .to(S, { lab: 1, duration: 0.03 }, end + 0.05)
        .to(S, { lab: 0, duration: 0.02 }, end + 0.085)
        .to(S, { ex: 0, face: 0.18, sak: 1, duration: 0.05, ease: 'power3.inOut' }, end + 0.075)
        .to(S, { rot: P.hero.rot, s: P.hero.s * 0.92, x: P.hero.x, y: P.hero.y, duration: 0.05, ease: 'power2.inOut' }, end + 0.075)
        .to(S, { fin: 1, duration: 0.03 }, end + 0.115)
        .to({}, { duration: 0.01 }, 0.99);
      apply();
    }

    build();
    let t;
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => { build(); ScrollTrigger.refresh(); }, 180); });
    ro.observe(stage.current);
    return () => { clearTimeout(t); ro.disconnect(); if (tl) { tl.scrollTrigger && tl.scrollTrigger.kill(); tl.kill(); } };
  }, []);

  const part = active >= 0 ? PARTS[active] : null;

  return (
    <section className="showcase" id="anatomy">
      <div className="stage" ref={stage}>
        <div className="hero-back" ref={heroBack}>
          <div className="bgword" aria-label={HERO.word}>
            {revealed && <SplitText text={HERO.word} tag="span" className="bgword-t" splitType="chars" effect="rise" mask delay={45} duration={1.3} textAlign="center" threshold={0} rootMargin="0px" />}
          </div>
        </div>
        <div className="hero-front" ref={heroFront}>
          <p className="kicker mono">{HERO.kicker}</p>
          <p className="tag-line">{HERO.line}</p>
          <p className="hint mono"><ShinyText text={HERO.hint + ' ↓'} color="#8f8a7c" shineColor="#efe8d8" speed={3} /></p>
        </div>

        <svg className="svg" ref={svg} role="img" aria-label="A katana with cherry blossoms, drawn in parts">
          <Katana reg={reg} />
        </svg>

        <svg className="leaders" ref={leaders} aria-hidden="true">
          {PARTS.map((p, i) => <line key={p.id} ref={(el) => { lines.current[i] = el; }} stroke="#efe8d8" strokeWidth="1" strokeDasharray="3 4" opacity="0" />)}
        </svg>
        {PARTS.map((p, i) => (
          <div className="lab" key={p.id} ref={(el) => { labs.current[i] = el; }}>
            <span className="lab-n mono">{p.num}</span>
            <span className="lab-t">{p.name}</span>
            <span className="lab-j">{p.jp}</span>
          </div>
        ))}

        <aside className={'panel' + (part ? ' on' : '')} aria-live="polite">
          {part && (
            <div className="panel-in" key={part.id}>
              <p className="mono panel-k"><span>{part.num} / 07</span><i /><DecryptedText text={part.title} animateOn="view" sequential speed={36} maxIterations={8} /></p>
              <h2 className="panel-h">{part.name}<em>{part.jp}</em></h2>
              <p className="panel-p">{part.role}</p>
              <p className="panel-m mono">{part.material}</p>
              <dl className="panel-s">{part.spec.map(([k, v]) => <div key={k}><dt className="mono">{k}</dt><dd>{v}</dd></div>)}</dl>
            </div>
          )}
        </aside>

        <ol className="rail" aria-hidden="true">{PARTS.map((p, i) => <li key={p.id} className={i === active ? 'on' : ''} />)}</ol>

        <div className="outro-q" ref={outro}>
          <p className="q">{OUTRO.quote}</p>
          <p className="mono">{OUTRO.note}</p>
        </div>
      </div>
    </section>
  );
}
