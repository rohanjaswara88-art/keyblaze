import { scrollToTarget } from '../lib/scroll';

export default function Nav({ show }) {
  return (
    <header className={'nav' + (show ? ' show' : '')}>
      <a href="#top" className="logo" onClick={(e) => { e.preventDefault(); scrollToTarget(0, { duration: 2.2 }); }}>SOLO<sup>®</sup></a>
      <nav aria-label="Sections">
        <a href="#anatomy" onClick={(e) => { e.preventDefault(); scrollToTarget('#anatomy', { duration: 2 }); }}>Anatomy</a>
      </nav>
    </header>
  );
}
