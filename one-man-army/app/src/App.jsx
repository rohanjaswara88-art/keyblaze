import { useEffect, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { initScroll } from './lib/scroll';
import Preloader from './components/Preloader.jsx';
import Nav from './components/Nav.jsx';
import Showcase from './components/Showcase.jsx';

export default function App() {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const stop = initScroll();
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh);
    return () => { window.removeEventListener('load', refresh); stop(); };
  }, []);

  return (
    <>
      <Preloader onReveal={() => setRevealed(true)} />
      <Nav show={revealed} />
      <main>
        <Showcase revealed={revealed} />
        <footer className="foot mono"><span>© 2026 SOLO</span><span>More of the story soon</span></footer>
      </main>
    </>
  );
}
