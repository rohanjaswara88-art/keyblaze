import { useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import DotGrid from './rb/DotGrid';
import ShinyText from './rb/ShinyText';
import DecryptedText from './rb/DecryptedText/DecryptedText';
import { ScrollVelocity } from './rb/ScrollVelocity';
import { reduceMotion } from '../lib/anim';

/* Original lines. *Starred* words are the ones that bleed red. */
const QUOTES = [
  { tag: 'Rescue', lines: ['Nobody is coming', 'to save you.', '*Climb.*'], foot: 'So stop waiting at the bottom.' },
  { tag: 'Tuition', lines: ['Pain is the *tuition.*', 'Pay it in full.'], foot: 'Interest compounds. So does regret.' },
  { tag: 'Comfort', lines: ['Comfort is a', 'slow *funeral.*'], foot: 'It looks like rest. It tastes like nothing.' },
  { tag: 'The mountain', lines: ["The mountain doesn't care.", "That's why it's *honest.*"], foot: 'It has never lied to anybody.' },
  { tag: 'Discipline', lines: ['*Discipline* shows up', 'when motivation quits.'], foot: 'Show up anyway.' },
  { tag: 'Victory', lines: ['Bleed quietly.', 'Win *loudly.*'], foot: 'Let the results make the noise.' }
];

const SOFT = new Set([1, 4]);   // which quotes set their second line in serif italic, for contrast

function Words({ text }) {
  return text.split(' ').map((raw, i) => {
    const key = raw.startsWith('*');
    const word = raw.replace(/\*/g, '');
    return (
      <span className={'cw' + (key ? ' key' : '')} key={i}>
        <span className="cwi">
          {key ? <ShinyText text={word} color="#c1121f" shineColor="#ffc9ce" speed={2.6} shineWidth={50} /> : word}
        </span>
      </span>
    );
  });
}

const pad = (n) => String(n).padStart(2, '0');

export default function Creed() {
  const pin = useRef(null), qs = useRef([]);
  const [active, setActive] = useState(0);
  const static_ = reduceMotion();

  useLayoutEffect(() => {
    if (static_) return;
    const ctx = gsap.context(() => {
      const N = QUOTES.length, seg = 3;
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: pin.current, start: 'top top', end: () => '+=' + Math.round(innerHeight * N * 1.1),
          pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true,
          onUpdate: (self) => {
            const i = Math.min(N - 1, Math.floor(self.progress * N * 0.9999));
            setActive((prev) => (prev === i ? prev : i));
          }
        }
      });
      QUOTES.forEach((_, i) => {
        const root = qs.current[i], t0 = i * seg;
        const words = root.querySelectorAll('.cwi'), num = root.querySelector('.cnum');
        const rule = root.querySelector('.crule'), foot = root.querySelector('.cfoot');
        tl.set(root, { visibility: 'visible' }, t0)
          .fromTo(num, { opacity: 0, scale: 1.28, xPercent: 10 }, { opacity: 1, scale: 1, xPercent: 0, duration: 1.3, ease: 'power2.out' }, t0)
          .fromTo(words, { yPercent: 118, opacity: 0, filter: 'blur(18px)', rotate: 4 },
            { yPercent: 0, opacity: 1, filter: 'blur(0px)', rotate: 0, duration: 1, stagger: 0.07, ease: 'power3.out' }, t0)
          .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power3.out' }, t0 + 0.75)
          .fromTo(foot, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, t0 + 0.95)
          .to(words, { yPercent: -112, opacity: 0, filter: 'blur(14px)', duration: 0.7, stagger: 0.035, ease: 'power2.in' }, t0 + seg - 0.85)
          .to([rule, foot], { opacity: 0, duration: 0.4 }, t0 + seg - 0.85)
          .to(num, { opacity: 0, scale: 0.9, xPercent: -8, duration: 0.7, ease: 'power2.in' }, t0 + seg - 0.85)
          .set(root, { visibility: 'hidden' }, t0 + seg);
      });
      tl.to({}, { duration: 0.2 });
    }, pin);
    return () => ctx.revert();
  }, []);

  return (
    <>
      <section className={'creed' + (static_ ? ' static' : '')} id="creed">
        <div className="creed-pin" ref={pin}>
          <div className="creed-dots" aria-hidden="true">
            <DotGrid dotSize={4} gap={22} baseColor="#24242a" activeColor="#c1121f" proximity={170} shockRadius={280} shockStrength={4} glow={0.6} />
          </div>
          <div className="creed-vig" aria-hidden="true" />

          <div className="cmeta mono">
            <span>The creed</span><i className="sep" />
            <span className="cnt">{pad(active + 1)} / {pad(QUOTES.length)}</span><i className="sep" />
            <DecryptedText key={active} text={QUOTES[active].tag} animateOn="view" sequential speed={38} maxIterations={9} />
          </div>
          <div className="cvert mono" aria-hidden="true">Brutal · Honest · True</div>
          <div className="crail" aria-hidden="true">{QUOTES.map((_, i) => <i key={i} className={i === active ? 'on' : ''} />)}</div>

          {QUOTES.map((q, i) => (
            <figure className={'cq' + (static_ ? ' on' : '')} key={q.tag} ref={(el) => { qs.current[i] = el; }}>
              <span className="cnum" aria-hidden="true">{pad(i + 1)}</span>
              <blockquote>
                {q.lines.map((line, li) => (
                  <span className={'cline' + (SOFT.has(i) && li === q.lines.length - 1 ? ' soft' : '')} key={li}><Words text={line} /></span>
                ))}
              </blockquote>
              <span className="crule" />
              <figcaption className="cfoot">{q.foot}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className="strip" style={{ fontFamily: 'var(--display)' }} aria-hidden="true">
        <ScrollVelocity
          texts={['NO EXCUSES ✦ NO SHORTCUTS ✦ NO DAYS OFF', 'PAIN IS TEMPORARY ✦ QUITTING IS FOREVER']}
          velocity={70} fontSize="clamp(2.6rem,7.5vw,8rem)" fontWeight={400} color="#ecebe6"
          outlineAlternate fadeEdges separator=" " gap={40} skewWithVelocity={4}
        />
      </div>
    </>
  );
}
