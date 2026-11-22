import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { reduceMotion } from './anim';

gsap.registerPlugin(ScrollTrigger, SplitText);

export const scroller = { lenis: null };

/** Smooth scrolling that drives ScrollTrigger. Starts stopped; the preloader releases it. */
export function initScroll() {
  if (reduceMotion()) return () => {};
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.95 });
  lenis.on('scroll', ScrollTrigger.update);
  const tick = (t) => lenis.raf(t * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
  scroller.lenis = lenis;
  return () => { gsap.ticker.remove(tick); lenis.destroy(); scroller.lenis = null; };
}

export function scrollToTarget(target, opts = {}) {
  const { lenis } = scroller;
  if (lenis) return lenis.scrollTo(target, { duration: 2, ...opts });
  const y = typeof target === 'number' ? target : document.querySelector(target).getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: y, behavior: 'smooth' });
  if (opts.onComplete) setTimeout(opts.onComplete, 900);
}
