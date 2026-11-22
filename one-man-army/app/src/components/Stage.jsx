import { useEffect, useRef } from 'react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Scene } from '../lib/ascent';
import { smooth, trap } from '../lib/anim';
import SplitText from './rb/SplitText/SplitText';
import ShinyText from './rb/ShinyText';

const CHAPTERS = [
  { tag: 'Chapter I', title: 'THE GRIND', text: 'Five a.m. No crowd, no applause. Just the mountain, the cold, and the next step.' },
  { tag: 'Chapter II', title: 'THE CLIMB', text: 'Every step is a decision. Quitting is always an option. He never picks it.' },
  { tag: 'Chapter III', title: 'UNSTOPPABLE', text: 'Impossible is just unfinished work.' }
];

export default function Stage({ heroRef, revealed }) {
  const canvas = useRef(null), hero = useRef(null), idx = useRef(null), chaps = useRef([]);

  useEffect(() => {
    const scene = Scene.create(canvas.current, { interact: true });
    heroRef.current = scene;
    let shocked = false;

    const apply = (p) => {
      scene.target.pan = p;
      scene.target.burn = smooth(0.5, 0.85, p);
      const h = smooth(0.02, 0.14, p);
      hero.current.style.opacity = 1 - h;
      hero.current.style.transform = `translateY(${-h * 12}vh)`;
      const o = [trap(p, 0.14, 0.22, 0.38, 0.44), trap(p, 0.46, 0.52, 0.64, 0.7), smooth(0.72, 0.78, p)];
      chaps.current.forEach((c, i) => {
        c.style.opacity = o[i];
        c.style.visibility = o[i] > 0.01 ? 'visible' : 'hidden';
        c.style.transform = `translateY(${(1 - o[i]) * 30}px)`;
      });
      idx.current.textContent = '0' + (p < 0.45 ? 1 : p < 0.7 ? 2 : 3);
      if (p > 0.7 && !shocked) { shocked = true; scene.shock(); }
      if (p < 0.64) shocked = false;
    };
    apply(0);

    const a = ScrollTrigger.create({ trigger: '.stage', start: 'top top', end: 'bottom bottom', onUpdate: (s) => apply(s.progress) });
    const b = ScrollTrigger.create({
      trigger: '.stage', start: 'top top', end: 'bottom top',
      onLeave: () => scene.setActive(false), onEnterBack: () => scene.setActive(true)
    });
    return () => { a.kill(); b.kill(); };
  }, []);

  return (
    <section className="stage" id="story">
      <div className="stage-in">
        <canvas id="scene" ref={canvas} aria-hidden="true" />

        <h1 className="hero" ref={hero} aria-label="One man doing the impossible">
          {revealed && (
            <SplitText text="ONE MAN" tag="span" className="hl" splitType="chars" effect="rise" mask
              delay={55} duration={1.25} textAlign="center" threshold={0} rootMargin="0px" />
          )}
          <em className={'hs' + (revealed ? ' show' : '')}>doing the</em>
          {revealed && (
            <SplitText text="IMPOSSIBLE" tag="span" className="hl" splitType="chars" effect="rise" mask
              delay={45} duration={1.25} textAlign="center" threshold={0} rootMargin="0px" />
          )}
        </h1>

        <p className={'hint mono' + (revealed ? ' show' : '')}>
          <ShinyText text="Hold to charge · Scroll to climb" color="#bdbdbd" shineColor="#ffffff" speed={3} />
        </p>

        {CHAPTERS.map((c, i) => (
          <div className="chap" key={c.title} ref={(el) => { chaps.current[i] = el; }}>
            <span className="tag mono">{c.tag}</span>
            <h2>{c.title}</h2>
            <p>{c.text}</p>
          </div>
        ))}
        <div className="idx mono"><b ref={idx}>01</b> / 03</div>
      </div>
    </section>
  );
}
