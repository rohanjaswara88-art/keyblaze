import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { finePointer } from '../lib/anim';

/** Ring + dot cursor that grows on links and over the story scene. */
export default function Cursor() {
  const ring = useRef(null), dot = useRef(null), label = useRef(null);

  useEffect(() => {
    if (!finePointer()) return;
    const m = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
    const move = (e) => { m.x = e.clientX; m.y = e.clientY; };
    const tick = () => {
      m.rx += (m.x - m.rx) * 0.18; m.ry += (m.y - m.ry) * 0.18;
      ring.current.style.transform = `translate(${m.rx}px,${m.ry}px)`;
      dot.current.style.transform = `translate(${m.x}px,${m.y}px)`;
    };
    const over = (e) => {
      const a = e.target.closest('a,button'), inStage = e.target.closest('.stage-in');
      if (a) { ring.current.classList.add('big'); label.current.textContent = 'GO'; }
      else if (inStage) { ring.current.classList.add('big'); label.current.textContent = 'IGNITE'; }
      else { ring.current.classList.remove('big'); label.current.textContent = ''; }
    };
    addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerover', over);
    gsap.ticker.add(tick);
    return () => {
      removeEventListener('pointermove', move);
      document.removeEventListener('pointerover', over);
      gsap.ticker.remove(tick);
    };
  }, []);

  return (
    <>
      <div className="cur-r" ref={ring} aria-hidden="true"><span ref={label} /></div>
      <div className="cur-d" ref={dot} aria-hidden="true" />
    </>
  );
}
