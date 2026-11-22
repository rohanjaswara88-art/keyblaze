import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { reduceMotion } from '../lib/anim';

const Lines = () => (
  <>THEY SLEPT.<br />HE TRAINED.<br />NOBODY WATCHED.<br /><span className="red">EVERYONE WILL.</span></>
);

/** Black wall of dim text. Your cursor is a flashlight that reveals it. */
export default function Manifesto() {
  const sec = useRef(null), lit = useRef(null);

  useEffect(() => {
    const reduce = reduceMotion();
    const lp = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let hasPointer = false;
    const move = (e) => {
      const r = sec.current.getBoundingClientRect();
      lp.tx = (e.clientX - r.left) / r.width; lp.ty = (e.clientY - r.top) / r.height; hasPointer = true;
    };
    const tick = (time) => {
      if (!hasPointer || reduce) { lp.tx = 0.5 + Math.sin(time * 0.6) * 0.32; lp.ty = 0.5 + Math.cos(time * 0.9) * 0.28; }
      lp.x += (lp.tx - lp.x) * 0.12; lp.y += (lp.ty - lp.y) * 0.12;
      lit.current.style.setProperty('--mx', (lp.x * 100).toFixed(2) + '%');
      lit.current.style.setProperty('--my', (lp.y * 100).toFixed(2) + '%');
    };
    const node = sec.current;
    node.addEventListener('pointermove', move);
    gsap.ticker.add(tick);
    return () => { node.removeEventListener('pointermove', move); gsap.ticker.remove(tick); };
  }, []);

  return (
    <section className="mani" id="manifesto" ref={sec}>
      <p className="kick mono">Move your light</p>
      <div className="mani-txt dim"><Lines /></div>
      <div className="mani-txt lit" ref={lit} aria-hidden="true"><div><Lines /></div></div>
    </section>
  );
}
