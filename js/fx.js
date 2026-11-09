/* Visual effects: key particles, confetti, click ripples, number tweens. */
(function (root) {
  'use strict';

  const LITE = Boolean(root.TT && root.TT.perf && root.TT.perf.lite);
  const MAX_PARTICLES = LITE ? 160 : 400; // each particle is a gradient fill per frame
  const MAX_DPR = LITE ? 1.5 : 2;
  let canvas = null;
  let ctx2d = null;
  let particles = [];
  let running = false;
  let dpr = 1;

  function resize() {
    if (!canvas) return;
    dpr = Math.min(MAX_DPR, root.devicePixelRatio || 1);
    canvas.width = root.innerWidth * dpr;
    canvas.height = root.innerHeight * dpr;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx2d = canvas.getContext('2d');
    resize();
    root.addEventListener('resize', resize);
  }

  function loop() {
    if (!ctx2d) return;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter((p) => p.life > 0);
    particles.forEach((p) => {
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      // Soft fade in and out so motes never pop.
      const t = 1 - p.life / p.maxLife;
      const alpha = Math.min(1, t * 6) * Math.min(1, p.life / (p.maxLife * 0.5)) * p.alpha;
      const r = p.size * dpr;
      const glow = ctx2d.createRadialGradient(p.x * dpr, p.y * dpr, 0, p.x * dpr, p.y * dpr, r * 3);
      glow.addColorStop(0, p.color);
      glow.addColorStop(0.25, p.color);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx2d.globalAlpha = alpha;
      ctx2d.globalCompositeOperation = 'lighter';
      ctx2d.fillStyle = glow;
      ctx2d.beginPath();
      ctx2d.arc(p.x * dpr, p.y * dpr, r * 3, 0, Math.PI * 2);
      ctx2d.fill();
    });
    ctx2d.globalAlpha = 1;
    ctx2d.globalCompositeOperation = 'source-over';
    if (particles.length > 0) {
      root.requestAnimationFrame(loop);
    } else {
      running = false;
    }
  }

  function add(newParticles) {
    particles = particles.concat(newParticles).slice(-MAX_PARTICLES);
    if (!running) {
      running = true;
      root.requestAnimationFrame(loop);
    }
  }

  function mote(o) {
    const life = o.life;
    return { gravity: 0, drag: 0.97, alpha: 0.8, ...o, life, maxLife: life };
  }

  /** A few faint motes of light that drift up from a point (keystrokes, clicks). */
  function burst(x, y, color, count) {
    const list = [];
    for (let i = 0; i < Math.min(4, count || 3); i += 1) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const speed = 0.3 + Math.random() * 0.9;
      list.push(mote({
        x: x + (Math.random() - 0.5) * 6, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: -0.004, size: 0.7 + Math.random() * 1.1, alpha: 0.55,
        life: 40 + Math.random() * 30, color,
      }));
    }
    add(list);
  }

  /** Slow shower of glints rising across the screen (personal best, rank up). */
  function confetti(colors, amount) {
    const list = [];
    const w = root.innerWidth;
    const h = root.innerHeight;
    for (let i = 0; i < Math.min(140, amount || 90); i += 1) {
      list.push(mote({
        x: Math.random() * w, y: h * (0.45 + Math.random() * 0.6),
        vx: (Math.random() - 0.5) * 0.4, vy: -(0.4 + Math.random() * 1.3),
        gravity: -0.006, drag: 0.995, size: 0.8 + Math.random() * 1.8, alpha: 0.9,
        life: 110 + Math.random() * 120, color: colors[i % colors.length],
      }));
    }
    add(list);
  }

  /** Material style ripple inside any element with class "ripple-host". */
  function ripple(event, el) {
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left = `${event.clientX - rect.left - size / 2}px`;
    dot.style.top = `${event.clientY - rect.top - size / 2}px`;
    el.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }

  /** Animates the number inside an element from one value to another. */
  function countUp(el, from, to, durationMs, decimals, onStep) {
    const start = performance.now();
    const places = decimals || 0;
    return new Promise((resolve) => {
      function frame(now) {
        const t = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = from + (to - from) * eased;
        el.textContent = value.toFixed(places);
        if (onStep) onStep(value, t);
        if (t < 1) {
          root.requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }
      root.requestAnimationFrame(frame);
    });
  }

  /** Floating "+1" style text that drifts up and fades. */
  function floatText(x, y, text, className) {
    const el = document.createElement('div');
    el.className = `float-text ${className || ''}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  root.TT = Object.assign(root.TT || {}, {
    fx: { init, burst, confetti, ripple, countUp, floatText },
  });
})(typeof window !== 'undefined' ? window : globalThis);
