import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { scroller } from '../lib/scroll';
import { reduceMotion } from '../lib/anim';

/** A short count to 100, then the curtain lifts and scrolling is released. */
export default function Preloader({ onReveal }) {
  const root = useRef(null), num = useRef(null);

  useEffect(() => {
    const reduce = reduceMotion(), cnt = { v: 0 };
    const tl = gsap.timeline({ delay: 0.15 });
    tl.to(cnt, {
      v: 100, duration: reduce ? 0.2 : 1.5, ease: 'power2.inOut',
      onUpdate: () => { if (num.current) num.current.textContent = String(Math.round(cnt.v)).padStart(3, '0'); }
    })
      .to(root.current, { yPercent: -100, duration: reduce ? 0.2 : 1, ease: 'expo.inOut' })
      .add(() => { scroller.lenis?.start(); onReveal(); }, '<0.45')
      .set(root.current, { display: 'none' });
    return () => tl.kill();
  }, []);

  return (
    <div className="pre" ref={root} aria-hidden="true">
      <span className="pre-t mono">Sharpening</span>
      <span className="pre-n" ref={num}>000</span>
    </div>
  );
}
