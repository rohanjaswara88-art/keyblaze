import { useEffect, useRef } from 'react';
import { Scene } from '../lib/summit';
import { scrollToTarget } from '../lib/scroll';
import ClickSpark from './rb/ClickSpark/ClickSpark';
import Magnet from './rb/Magnet/Magnet';
import FuzzyText from './rb/FuzzyText/FuzzyText';
import ShinyText from './rb/ShinyText';
import { ScrollVelocity } from './rb/ScrollVelocity';

/** Last screen: the burning star again, a fuzzy headline, a magnetic button, click sparks. */
export default function Finale({ heroRef }) {
  const canvas = useRef(null);

  useEffect(() => {
    const scene = Scene.create(canvas.current, { fixed: 0.56, init: { intro: 1, burn: 1 } });
    scene.setActive(false);
    const io = new IntersectionObserver((e) => scene.setActive(e[0].isIntersecting), { rootMargin: '100px' });
    io.observe(canvas.current);
    return () => io.disconnect();
  }, []);

  const restart = (e) => {
    e.preventDefault();
    scrollToTarget(0, { duration: 2.6, onComplete: () => heroRef.current?.shock() });
  };

  return (
    <section className="fin" id="arena">
      <canvas id="finScene" ref={canvas} aria-hidden="true" />
      <ClickSpark className="fin-spark" sparkColor="#ffffff" sparkCount={12} sparkRadius={46} sparkSize={16} duration={620} extraScale={1.3} shape="line" layer="front">
        <div className="fin-in">
          <p className="mono"><ShinyText text="Your turn" color="#c1121f" shineColor="#ffffff" speed={2.4} /></p>
          <h2 className="out" aria-label="Earn it.">
            <FuzzyText fontSize="clamp(5rem,17vw,22rem)" fontWeight={400} fontFamily="Anton, Impact, sans-serif" color="#ffffff"
              baseIntensity={0.1} hoverIntensity={0.45} enableHover>EARN IT.</FuzzyText>
          </h2>
          <Magnet padding={140} magnetStrength={3}>
            <a className="btn" href="#top" onClick={restart}>Back to the start <span aria-hidden="true">↑</span></a>
          </Magnet>
        </div>
        <div className="tick" aria-hidden="true" style={{ fontFamily: 'var(--display)' }}>
          <ScrollVelocity texts={['NO SHORTCUTS ✦ NO DAYS OFF ✦ NO EXCUSES']} velocity={90} fontSize="clamp(1.4rem,3vw,2.6rem)" fontWeight={400} color="#ffffff" separator=" ✦ " gap={24} />
        </div>
        <footer className="mono">© 2026 SOLO — concept experience. Every visual is generated in code. Built with React, React Bits, GSAP and Lenis.</footer>
      </ClickSpark>
    </section>
  );
}
