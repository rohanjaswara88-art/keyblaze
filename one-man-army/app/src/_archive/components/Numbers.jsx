import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import CountUp from './rb/CountUp/CountUp';

/** Horizontal scroll through the numbers; the figures count up as each panel arrives. */
export default function Numbers() {
  const sec = useRef(null), pin = useRef(null), track = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.to(track.current, {
        x: () => -(track.current.scrollWidth - innerWidth), ease: 'none',
        scrollTrigger: {
          trigger: sec.current, pin: pin.current, scrub: 0.6, anticipatePin: 1,
          start: 'top top', end: () => '+=' + (track.current.scrollWidth - innerWidth), invalidateOnRefresh: true
        }
      });
    }, sec);
    return () => ctx.revert();
  }, []);

  return (
    <section className="nums" id="numbers" ref={sec}>
      <div className="nums-pin" ref={pin}>
        <div className="track" ref={track}>
          <article className="pan">
            <span className="mono">Reps</span>
            <div className="big"><CountUp to={5000} duration={2.4} /></div>
            <p>Before sunrise. Nobody counted but him.</p>
          </article>
          <article className="pan">
            <span className="mono">Days off</span>
            <div className="big"><CountUp to={0} from={30} duration={2} /></div>
            <p>Rest is a rumour spread by the ones who quit.</p>
          </article>
          <article className="pan inv">
            <span className="mono">Rule</span>
            <div className="quote">NOBODY HANDS<br />YOU THE<br />IMPOSSIBLE.<br /><em>you earn it.</em></div>
          </article>
          <article className="pan">
            <span className="mono">Man</span>
            <div className="big"><CountUp to={1} duration={1.2} /></div>
            <p>That is all it takes. That is all of it.</p>
          </article>
        </div>
      </div>
    </section>
  );
}
