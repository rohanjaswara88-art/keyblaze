import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { scroller } from '../lib/scroll';
import { reduceMotion } from '../lib/anim';

/** Counts to 100, lifts like a curtain, then releases scrolling and the hero. */
export default function Preloader({ heroRef, onReveal }) {
  const root = useRef(null);
  const num = useRef(null);

  useEffect(() => {
    const reduce = reduceMotion();
    const cnt = { v: 0 };
    document.body.style.overflow = scroller.lenis ? '' : 'hidden';
    const tl = gsap.timeline({ delay: 0.2 });
    tl.to(cnt, {
      v: 100, duration: reduce ? 0.2 : 2.2, ease: 'power2.inOut',
      onUpdate: () => { if (num.current) num.current.textContent = String(Math.round(cnt.v)).padStart(3, '0'); }
    })
      .add(() => { if (heroRef.current) heroRef.current.target.intro = 1; })
      .to(root.current, { yPercent: -100, duration: reduce ? 0.2 : 1.1, ease: 'expo.inOut' })
      .add(() => { scroller.lenis?.start(); document.body.style.overflow = ''; onReveal(); }, '<0.5')
      .set(root.current, { display: 'none' });
    return () => tl.kill();
  }, []);

  return (
    <div className="pre" ref={root} aria-hidden="true">
      <span className="pre-t mono">Five a.m. Nobody is watching</span>
      <span className="pre-n" ref={num}>000</span>
    </div>
  );
}
