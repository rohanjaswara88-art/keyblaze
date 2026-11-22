import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initScroll } from './lib/scroll';
import Preloader from './components/Preloader.jsx';
import Cursor from './components/Cursor.jsx';
import Nav from './components/Nav.jsx';
import Stage from './components/Stage.jsx';
import Creed from './components/Creed.jsx';
import Manifesto from './components/Manifesto.jsx';
import Numbers from './components/Numbers.jsx';
import Finale from './components/Finale.jsx';

export default function App() {
  const heroRef = useRef(null);          // the hero scene, shared with the preloader and nav
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const stop = initScroll();
    gsap.to('#bar', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);
    return () => { window.removeEventListener('load', refresh); stop(); };
  }, []);

  return (
    <>
      <Preloader heroRef={heroRef} onReveal={() => setRevealed(true)} />
      <div className="grain" aria-hidden="true" />
      <Cursor />
      <div className="bar" aria-hidden="true"><i id="bar" /></div>
      <Nav show={revealed} heroRef={heroRef} />
      <main>
        <Stage heroRef={heroRef} revealed={revealed} />
        <Creed />
        <Manifesto />
        <Numbers />
        <Finale heroRef={heroRef} />
      </main>
    </>
  );
}
