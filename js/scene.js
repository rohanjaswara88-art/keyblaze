/* Dusk landscape: procedural ridges, stars and soft mouse parallax. Colours come from CSS vars. */
(function (root) {
  'use strict';

  const W = 1600;
  const H = 900;
  const STAR_LAYERS = [{ count: 90, size: 1 }, { count: 45, size: 1.5 }, { count: 14, size: 2 }];
  const PARALLAX_EASE = 0.06;

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /**
   * Midpoint-displacement ridge line.
   * @param {{seed:number, base:number, amp:number, rough:number, envelope:(x:number)=>number, smooth?:number}} o
   */
  function ridgePoints(o) {
    const rng = seededRandom(o.seed);
    const segments = 128;
    const ys = new Array(segments + 1).fill(0);
    let step = segments;
    let scale = 1;
    while (step > 1) {
      const half = step / 2;
      for (let i = half; i < segments; i += step) {
        ys[i] = (ys[i - half] + ys[i + half]) / 2 + (rng() * 2 - 1) * scale;
      }
      step = half;
      scale *= o.rough;
    }
    // Optional smoothing pass for silky dunes.
    for (let pass = 0; pass < (o.smooth || 0); pass += 1) {
      for (let i = 1; i < segments; i += 1) ys[i] = (ys[i - 1] + ys[i] * 2 + ys[i + 1]) / 4;
    }
    // Where the envelope fades out, the ridge sinks below the layers in front
    // instead of leaving a flat, hard horizon line.
    return ys.map((y, i) => {
      const x = (i / segments) * W;
      const env = o.envelope(x / W);
      const height = (0.45 + Math.abs(y)) * o.amp * env;
      return [x, o.base - height + (1 - Math.min(1, env)) * (o.sink || 0)];
    });
  }

  function toPath(points) {
    let d = `M0 ${H} L${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
    for (let i = 1; i < points.length; i += 1) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const mx = (x0 + x1) / 2;
      d += ` Q${x0.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`;
    }
    const last = points[points.length - 1];
    return `${d} L${last[0]} ${last[1].toFixed(1)} L${W} ${H} Z`;
  }

  function ridgeOnly(points) {
    return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  }

  // Back to front. depth drives parallax strength.
  const smoothstep = (a, b, t) => {
    const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return x * x * (3 - 2 * x);
  };

  const LAYERS = [
    { id: 'far', seed: 11, base: 610, amp: 90, rough: 0.55, depth: 4, smooth: 1, sink: 20, envelope: (t) => 0.35 + 0.65 * smoothstep(0.1, 0.5, t) * smoothstep(1.05, 0.6, t), rim: 0.22 },
    { id: 'mid', seed: 23, base: 650, amp: 150, rough: 0.48, depth: 9, smooth: 2, sink: 120, envelope: (t) => smoothstep(0.62, 0.02, t) * 0.95 + smoothstep(0.7, 1.0, t) * 0.5, rim: 0.3 },
    { id: 'rock', seed: 57, base: 700, amp: 230, rough: 0.62, depth: 14, sink: 260, envelope: (t) => smoothstep(0.56, 0.78, t) * (0.75 + 0.25 * smoothstep(0.78, 0.92, t)), rim: 0.34 },
    { id: 'dune', seed: 5, base: 790, amp: 150, rough: 0.4, depth: 20, smooth: 4, sink: 160, envelope: (t) => smoothstep(0.55, 0.0, t) * 0.9 + 0.1, rim: 0.4 },
    { id: 'near', seed: 91, base: 900, amp: 70, rough: 0.5, depth: 32, smooth: 3, sink: 0, envelope: (t) => 0.5 + 0.5 * Math.abs(Math.cos(t * 2.2)), rim: 0.1 },
  ];

  function mountainsMarkup() {
    const defs = LAYERS.map((l, i) => `<linearGradient id="g-${l.id}" x1="0" y1="${l.base - l.amp}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">` +
      `<stop offset="0" style="stop-color:var(--m${i}-top)"/><stop offset="1" style="stop-color:var(--m${i}-bottom)"/></linearGradient>`).join('');
    const glow = '<radialGradient id="g-glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" style="stop-color:var(--horizon)" stop-opacity="0.85"/>' +
      '<stop offset="0.45" style="stop-color:var(--horizon)" stop-opacity="0.25"/><stop offset="1" style="stop-color:var(--horizon)" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="g-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--mist)" stop-opacity="0"/>' +
      '<stop offset="0.5" style="stop-color:var(--mist)" stop-opacity="0.55"/><stop offset="1" style="stop-color:var(--mist)" stop-opacity="0"/></linearGradient>' +
      '<filter id="f-soft"><feGaussianBlur stdDeviation="1.4"/></filter><filter id="f-near"><feGaussianBlur stdDeviation="4"/></filter>';

    const layers = LAYERS.map((l, i) => {
      const pts = ridgePoints(l);
      const blur = l.id === 'near' ? ' filter="url(#f-near)"' : '';
      const mist = i === 1
        ? '<rect x="0" y="560" width="1600" height="160" fill="url(#g-mist)"/>'
        : '';
      return `<g class="layer" data-depth="${l.depth}"${blur}><path d="${toPath(pts)}" fill="url(#g-${l.id})"/>` +
        `<path d="${ridgeOnly(pts)}" fill="none" style="stroke:var(--rim)" stroke-opacity="${l.rim}" stroke-width="1.6" filter="url(#f-soft)"/></g>${mist}`;
    }).join('');

    return `<defs>${defs}${glow}</defs>` +
      '<g class="layer" data-depth="2"><ellipse cx="830" cy="610" rx="520" ry="150" fill="url(#g-glow)"/></g>' +
      layers;
  }

  function buildMountains(svg) {
    svg.innerHTML = mountainsMarkup();
  }

  const SKY_STOPS = [[0, '--sky-0'], [0.28, '--sky-1'], [0.52, '--sky-2'], [0.64, '--sky-3'], [0.7, '--sky-4'], [0.74, '--sky-3'], [1, '--m4-bottom']];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not rasterise the landscape'));
      img.src = url;
    });
  }

  /**
   * Draws the current theme's sky and mountains into two canvases so WebGL can
   * refract them. The land canvas is drawn slightly oversized for parallax room.
   * @returns {Promise<{sky:HTMLCanvasElement, land:HTMLCanvasElement}>}
   */
  async function rasterize(width, height) {
    const sky = document.createElement('canvas');
    sky.width = width;
    sky.height = height;
    const sctx = sky.getContext('2d');
    const grad = sctx.createLinearGradient(0, 0, 0, height);
    SKY_STOPS.forEach(([at, name]) => grad.addColorStop(at, cssVar(name)));
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, width, height);

    // CSS variables don't resolve inside an <img>, so bake the colours in.
    const markup = mountainsMarkup().replace(/var\((--[\w-]+)\)/g, (m, name) => cssVar(name) || '#000');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${markup}</svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const img = await loadImage(url);
      const land = document.createElement('canvas');
      land.width = width;
      land.height = height;
      const scale = Math.max(width / W, height / H) * 1.04;
      const dw = W * scale;
      const dh = H * scale;
      land.getContext('2d').drawImage(img, (width - dw) / 2, height - dh + dh * 0.02, dw, dh);
      return { sky, land };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function buildStars(el) {
    const w = root.innerWidth;
    const h = root.innerHeight * 0.62;
    const rng = seededRandom(1234);
    el.innerHTML = STAR_LAYERS.map((layer, i) => {
      const shadows = [];
      for (let s = 0; s < layer.count; s += 1) {
        const x = Math.round(rng() * w);
        const y = Math.round(rng() * h);
        const a = (0.35 + rng() * 0.65).toFixed(2);
        shadows.push(`${x}px ${y}px 0 rgba(255,255,255,${a})`);
      }
      return `<i class="star-layer s${i}" style="width:${layer.size}px;height:${layer.size}px;box-shadow:${shadows.join(',')}"></i>`;
    }).join('');
  }

  function initParallax(scene) {
    const layers = [...scene.querySelectorAll('.layer')];
    const stars = scene.querySelector('.stars');
    let target = { x: 0, y: 0 };
    let current = { x: 0, y: 0 };
    let raf = null;

    function frame() {
      current = {
        x: current.x + (target.x - current.x) * PARALLAX_EASE,
        y: current.y + (target.y - current.y) * PARALLAX_EASE,
      };
      layers.forEach((l) => {
        const d = Number(l.dataset.depth);
        l.setAttribute('transform', `translate(${(current.x * d).toFixed(2)} ${(current.y * d * 0.4).toFixed(2)})`);
      });
      stars.style.transform = `translate3d(${current.x * -3}px, ${current.y * -2}px, 0)`;
      const settled = Math.abs(target.x - current.x) < 0.001 && Math.abs(target.y - current.y) < 0.001;
      raf = settled ? null : root.requestAnimationFrame(frame);
    }

    root.addEventListener('pointermove', (e) => {
      target = { x: (e.clientX / root.innerWidth - 0.5) * -1, y: (e.clientY / root.innerHeight - 0.5) * -1 };
      if (!raf) raf = root.requestAnimationFrame(frame);
    }, { passive: true });
  }

  function init() {
    const scene = document.getElementById('scene');
    if (!scene) return;
    buildMountains(document.getElementById('mountains'));
    const stars = document.getElementById('stars');
    buildStars(stars);
    let resizeTimer = null;
    root.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => buildStars(stars), 200);
    });
    if (!root.matchMedia('(prefers-reduced-motion: reduce)').matches) initParallax(scene);
  }

  root.TT = Object.assign(root.TT || {}, { scene: { init, rasterize } });
})(typeof window !== 'undefined' ? window : globalThis);
