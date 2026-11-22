import { scrollToTarget } from '../lib/scroll';

const LINKS = [['#story', 'Story'], ['#creed', 'Creed'], ['#manifesto', 'Manifesto'], ['#numbers', 'Numbers'], ['#arena', 'Finish']];

export default function Nav({ show }) {
  const go = (e, href) => { e.preventDefault(); scrollToTarget(href, { duration: 2 }); };
  return (
    <header className={'nav' + (show ? ' show' : '')}>
      <a href="#top" className="logo" onClick={(e) => { e.preventDefault(); scrollToTarget(0, { duration: 2.2 }); }}>SOLO<sup>®</sup></a>
      <nav aria-label="Sections">
        {LINKS.map(([href, name]) => <a key={href} href={href} onClick={(e) => go(e, href)}>{name}</a>)}
      </nav>
    </header>
  );
}
