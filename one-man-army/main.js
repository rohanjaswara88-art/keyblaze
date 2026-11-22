/* SOLO — scroll, motion and interaction. */
(function () {
  'use strict';

  var root = document.documentElement;
  if (!window.gsap || !window.ScrollTrigger || !window.Scene) {
    // Libraries failed to load: show the page without the preloader/animation layer.
    root.classList.remove('js');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var smooth = function (a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  var trap = function (p, a, b, c, d) { return smooth(a, b, p) * (1 - smooth(c, d, p)); };

  /* ---------- smooth scroll ---------- */
  var lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  }
  function scrollTo(target, opts) {
    if (lenis) lenis.scrollTo(target, opts || { duration: 2 });
    else {
      var y = typeof target === 'number' ? target : $(target).getBoundingClientRect().top + scrollY;
      scrollTo.native(y);
    }
  }
  scrollTo.native = function (y) { window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' }); };

  /* ---------- scenes ---------- */
  var hero = Scene.create($('#scene'));
  var fin = Scene.create($('#finScene'), { fixed: 0.56, init: { intro: 1, burn: 1 } });
  fin.setActive(false);
  new IntersectionObserver(function (e) { fin.setActive(e[0].isIntersecting); }, { rootMargin: '100px' }).observe($('#finScene'));

  /* ---------- text split ---------- */
  function split(el) {
    var txt = el.textContent;
    el.textContent = '';
    el.setAttribute('aria-hidden', 'true');
    Array.prototype.forEach.call(txt, function (c) {
      var o = document.createElement('span'); o.className = 'ch';
      var i = document.createElement('span'); i.textContent = c === ' ' ? ' ' : c;
      o.appendChild(i); el.appendChild(o);
    });
    return $$('.ch>span', el);
  }
  var heroChars = split($('#h1a')).concat(split($('#h1b')));
  gsap.set(heroChars, { yPercent: 115 });
  gsap.set('.hs, .hint, .nav', { opacity: 0 });

  /* ---------- preloader ---------- */
  var cnt = { v: 0 };
  var preN = $('#preN');
  var intro = gsap.timeline({ delay: 0.2 });
  intro
    .to(cnt, {
      v: 100, duration: reduce ? 0.2 : 2.2, ease: 'power2.inOut',
      onUpdate: function () { preN.textContent = String(Math.round(cnt.v)).padStart(3, '0'); }
    })
    .add(function () { hero.target.intro = 1; })
    .to('#pre', { yPercent: -100, duration: reduce ? 0.2 : 1.1, ease: 'expo.inOut' })
    .add(function () { if (lenis) lenis.start(); document.body.style.overflow = ''; }, '<0.5')
    .to(heroChars, { yPercent: 0, duration: 1.3, stagger: 0.07, ease: 'expo.out' }, '<0.15')
    .to('.hs, .hint, .nav', { opacity: 1, duration: 0.9, stagger: 0.12 }, '<0.5')
    .set('#pre', { display: 'none' });
  if (!lenis) document.body.style.overflow = '';

  /* ---------- story (pinned scene, scroll-scrubbed) ---------- */
  var chaps = $$('.chap');
  var heroEl = $('#hero');
  var idxEl = $('#idx');
  var shocked = false;

  function apply(p) {
    var T = hero.target;
    T.pan = p;
    T.burn = smooth(0.5, 0.85, p);

    var h = smooth(0.02, 0.14, p);
    heroEl.style.opacity = 1 - h;
    heroEl.style.transform = 'translateY(' + (-h * 12) + 'vh)';

    var o = [trap(p, 0.14, 0.22, 0.38, 0.44), trap(p, 0.46, 0.52, 0.64, 0.7), smooth(0.72, 0.78, p)];
    chaps.forEach(function (c, i) {
      c.style.opacity = o[i];
      c.style.visibility = o[i] > 0.01 ? 'visible' : 'hidden';
      c.style.transform = 'translateY(' + ((1 - o[i]) * 30) + 'px)';
    });
    idxEl.textContent = '0' + (p < 0.45 ? 1 : p < 0.7 ? 2 : 3);

    if (p > 0.7 && !shocked) { shocked = true; hero.shock(); }
    if (p < 0.64) shocked = false;
  }
  apply(0);

  ScrollTrigger.create({
    trigger: '.stage', start: 'top top', end: 'bottom bottom',
    onUpdate: function (self) { apply(self.progress); }
  });
  ScrollTrigger.create({
    trigger: '.stage', start: 'top top', end: 'bottom top',
    onLeave: function () { hero.setActive(false); },
    onEnterBack: function () { hero.setActive(true); }
  });

  addEventListener('pointerdown', function (e) {
    if (e.target.closest('a,button')) return;
    var r = $('.stage').getBoundingClientRect();
    if (r.bottom > innerHeight * 0.5 && r.top < innerHeight * 0.5) hero.shock();
  });

  /* ---------- progress bar ---------- */
  gsap.to('#bar', { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: true } });

  /* ---------- flashlight manifesto ---------- */
  var mani = $('#manifesto');
  var lit = $('#lit');
  var lp = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  var hasPointer = false;
  mani.addEventListener('pointermove', function (e) {
    var r = mani.getBoundingClientRect();
    lp.tx = (e.clientX - r.left) / r.width;
    lp.ty = (e.clientY - r.top) / r.height;
    hasPointer = true;
  });
  gsap.ticker.add(function (time) {
    if (!hasPointer || reduce) {
      lp.tx = 0.5 + Math.sin(time * 0.6) * 0.32;
      lp.ty = 0.5 + Math.cos(time * 0.9) * 0.28;
    }
    lp.x += (lp.tx - lp.x) * 0.12;
    lp.y += (lp.ty - lp.y) * 0.12;
    lit.style.setProperty('--mx', (lp.x * 100).toFixed(2) + '%');
    lit.style.setProperty('--my', (lp.y * 100).toFixed(2) + '%');
  });

  /* ---------- horizontal numbers ---------- */
  var track = $('#track');
  function count(b) {
    if (b.dataset.done) return;
    b.dataset.done = '1';
    var to = +b.dataset.to, o = { v: 0 };
    gsap.to(o, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: function () { b.textContent = Math.round(o.v); } });
  }
  $$('.big b').forEach(function (b) { b.textContent = '0'; });

  var mm = gsap.matchMedia();
  mm.add('(min-width: 0px)', function () {
    var tween = gsap.to(track, {
      x: function () { return -(track.scrollWidth - innerWidth); },
      ease: 'none',
      scrollTrigger: {
        trigger: '.nums', pin: '.nums-pin', scrub: 0.6, anticipatePin: 1,
        start: 'top top', end: function () { return '+=' + (track.scrollWidth - innerWidth); },
        invalidateOnRefresh: true
      }
    });
    $$('.pan').forEach(function (pan, i) {
      var nums = $$('.big b', pan);
      if (!nums.length) return;
      if (i === 0) {
        ScrollTrigger.create({ trigger: '.nums', start: 'top 60%', once: true, onEnter: function () { nums.forEach(count); } });
      } else {
        ScrollTrigger.create({ trigger: pan, containerAnimation: tween, start: 'left 75%', once: true, onEnter: function () { nums.forEach(count); } });
      }
    });
  });

  /* ---------- finale text ---------- */
  gsap.from('#finH', {
    yPercent: 25, opacity: 0, duration: 1.2, ease: 'expo.out',
    scrollTrigger: { trigger: '#arena', start: 'top 60%' }
  });

  /* ---------- custom cursor + magnetic ---------- */
  if (fine) {
    var ring = $('#curR'), dot = $('#curD'), label = $('#curT');
    var m = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
    addEventListener('pointermove', function (e) { m.x = e.clientX; m.y = e.clientY; }, { passive: true });
    gsap.ticker.add(function () {
      m.rx += (m.x - m.rx) * 0.16; m.ry += (m.y - m.ry) * 0.16;
      ring.style.transform = 'translate(' + m.rx + 'px,' + m.ry + 'px)';
      dot.style.transform = 'translate(' + m.x + 'px,' + m.y + 'px)';
    });
    document.addEventListener('pointerover', function (e) {
      var a = e.target.closest('a,button');
      var inStage = e.target.closest('.stage-in');
      if (a) { ring.classList.add('big'); label.textContent = 'GO'; }
      else if (inStage) { ring.classList.add('big'); label.textContent = 'IGNITE'; }
      else { ring.classList.remove('big'); label.textContent = ''; }
    });

    $$('.mag').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.35, y: (e.clientY - r.top - r.height / 2) * 0.5, duration: 0.4, ease: 'power3.out' });
      });
      el.addEventListener('pointerleave', function () {
        gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1,.4)' });
      });
    });
  }

  /* ---------- links ---------- */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var h = a.getAttribute('href');
      e.preventDefault();
      if (h === '#top') {
        scrollTo(0, { duration: 2.6, onComplete: function () { hero.shock(); } });
        return;
      }
      scrollTo(h, { duration: 2, offset: 0 });
    });
  });

  addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
