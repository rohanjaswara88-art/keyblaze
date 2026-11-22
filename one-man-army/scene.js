/* SOLO — "The Ascent": motion on top of a single picture.
   The camera climbs the artwork as you scroll, the wings burn, embers rise. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var coarse = matchMedia('(pointer: coarse)').matches;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mouse = { x: 0.5, y: 0.5 };
  addEventListener('pointermove', function (e) {
    mouse.x = e.clientX / innerWidth;
    mouse.y = e.clientY / innerHeight;
  }, { passive: true });

  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var smooth = function (a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  var easeIO = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };

  var torch = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d'); var g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,150,80,1)'); g.addColorStop(1, 'rgba(255,80,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); return c;
  })();

  /* ---------- load the picture once, prepare glow layers ---------- */
  var img = new Image();
  var hd = new Image();
  var hdReady = false;
  var ready = false;
  var IW = 0, IH = 0, glowSharp = null, glowBloom = null, embers = [];

  function bloom(src) {
    var w = src.width, h = src.height;
    var a = document.createElement('canvas');
    a.width = Math.max(1, w >> 3); a.height = Math.max(1, h >> 3);
    var ax = a.getContext('2d'); ax.imageSmoothingEnabled = true;
    ax.drawImage(src, 0, 0, a.width, a.height);
    var b = document.createElement('canvas'); b.width = w; b.height = h;
    var bx = b.getContext('2d'); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = 'high';
    bx.drawImage(a, 0, 0, w, h);
    return b;
  }

  function prepare() {
    IW = img.naturalWidth; IH = img.naturalHeight;
    try {
      var c = document.createElement('canvas'); c.width = IW; c.height = IH;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      var d = x.getImageData(0, 0, IW, IH).data;
      var gw = IW >> 1, gh = IH >> 1;
      var m = document.createElement('canvas'); m.width = gw; m.height = gh;
      var mx = m.getContext('2d');
      var out = mx.createImageData(gw, gh);
      for (var y = 0; y < gh; y++) {
        for (var xx = 0; xx < gw; xx++) {
          var lum = d[((y * 2) * IW + xx * 2) * 4];
          var nx = xx / gw, ny = y / gh;
          var dx = (nx - 0.52) / 0.38, dy = (ny - 0.6) / 0.27;
          var reg = Math.max(0, 1 - (dx * dx + dy * dy));
          var a = lum > 175 ? ((lum - 175) / 80) * Math.pow(reg, 0.55) : 0;
          var o = (y * gw + xx) * 4;
          out.data[o] = 255; out.data[o + 1] = 70 + a * 110; out.data[o + 2] = 40 + a * 40; out.data[o + 3] = a * 255;
          if (a > 0.5 && Math.random() < 0.025) embers.push([nx, ny]);
        }
      }
      mx.putImageData(out, 0, 0);
      glowSharp = m;
      glowBloom = bloom(m);
    } catch (e) { /* pixel access blocked (file://): the picture still moves, just without the burn */ }
    if (!embers.length) embers.push([0.5, 0.6]);
    ready = true;
  }
  img.onload = prepare;
  img.src = 'media/ascent.jpg';
  hd.onload = function () { hdReady = true; };
  hd.src = 'media/ascent-hd.jpg';

  /* ---------- scene ---------- */
  function create(cv, opts) {
    opts = opts || {};
    var ctx = cv.getContext('2d');
    var target = { pan: 0, burn: 0, intro: 0 };
    if (opts.init) for (var k in opts.init) target[k] = opts.init[k];
    var cur = {}; for (var k2 in target) cur[k2] = target[k2];

    var W = 1, H = 1, DPR = 1, t = 0, lastT = 0, flash = 0, active = true, parts = [];
    var sm = { x: 0.5, y: 0.5 };
    var charge = 0, charging = false, pm = { x: -1, y: -1, px: -1, py: -1 }, view = { sx: 0, sy: 0, k: 1 };

    var dprCap = Math.min(devicePixelRatio || 1, 1.75), slow = 0, vig = null;
    function resize() {
      var b = cv.getBoundingClientRect();
      DPR = dprCap;
      W = Math.max(1, Math.round(b.width)); H = Math.max(1, Math.round(b.height));
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      vig = document.createElement('canvas'); vig.width = Math.max(2, W >> 2); vig.height = Math.max(2, H >> 2);
      var vx = vig.getContext('2d'), vw = vig.width, vh = vig.height;
      var vg = vx.createRadialGradient(vw / 2, vh * 0.55, Math.min(vw, vh) * 0.35, vw / 2, vh * 0.55, Math.max(vw, vh) * 0.8);
      vg.addColorStop(0, 'rgba(5,5,6,0)'); vg.addColorStop(1, 'rgba(5,5,6,.78)');
      vx.fillStyle = vg; vx.fillRect(0, 0, vw, vh);
    }

    function spawn(n, power) {
      for (var i = 0; i < n; i++) {
        var e = embers[(Math.random() * embers.length) | 0];
        parts.push({
          x: e[0] * IW, y: e[1] * IH,
          vx: (Math.random() - 0.5) * 0.5 * power,
          vy: -(0.35 + Math.random() * 1.1) * power,
          r: 0.8 + Math.random() * 2.2,
          life: 1, dec: 0.006 + Math.random() * 0.012,
          ph: Math.random() * TAU
        });
      }
      if (parts.length > 420) parts.splice(0, parts.length - 420);
    }

    function spawnAt(ix, iy, n, power) {
      for (var i = 0; i < n; i++) {
        parts.push({
          x: ix + (Math.random() - 0.5) * 6, y: iy + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 1.4 * power, vy: -(0.2 + Math.random() * 0.9) * power,
          r: 0.7 + Math.random() * 1.6, life: 0.8, dec: 0.014 + Math.random() * 0.02, ph: Math.random() * TAU
        });
      }
      if (parts.length > 420) parts.splice(0, parts.length - 420);
    }

    function shock(power) {
      power = power === undefined ? 1 : power;
      flash = Math.min(1, 0.55 + power * 0.45);
      spawn(Math.round((coarse ? 90 : 220) * (0.5 + power)), 1.6 + power * 1.4);
    }

    if (opts.interact) {
      addEventListener('pointermove', function (e) { pm.x = e.clientX; pm.y = e.clientY; }, { passive: true });
      addEventListener('pointerdown', function (e) {
        if (!active || e.target.closest('a,button')) return;
        charging = true;
      });
      var release = function () {
        if (!charging) return;
        charging = false;
        shock(Math.max(0.35, charge));
        charge = 0;
      };
      addEventListener('pointerup', release);
      addEventListener('pointercancel', release);
    }

    function draw() {
      var intro = 1 - Math.pow(1 - clamp(cur.intro, 0, 1), 3);
      var p = cur.pan;
      var fixed = opts.fixed;

      var base = Math.max(W / IW, H / IH);
      var zoom = fixed ? 1.04 : 1 + 0.1 * smooth(0.75, 1, p);
      zoom *= 1 + (1 - intro) * 0.22 + (reduce ? 0 : Math.sin(t * 0.6) * 0.006) + charge * 0.05;
      var k = base * zoom;
      var vw = W / k, vh = H / k;

      var fyStart = 0.835 - 0.22 * (vh / IH);
      var fy = fixed ? fixed : fyStart + (0.56 - fyStart) * easeIO(clamp(p / 0.8, 0, 1)) - 0.05 * smooth(0.8, 1, p);
      var fx = fixed ? 0.5 : 0.5 + 0.3 * (1 - smooth(0, 0.4, p));
      var cx = clamp(fx * IW, Math.min(vw / 2, IW / 2), Math.max(IW - vw / 2, IW / 2));
      var cy = clamp(fy * IH, Math.min(vh / 2, IH / 2), Math.max(IH - vh / 2, IH / 2));
      var sx = cx - vw / 2 - (sm.x - 0.5) * 18 / k;
      var sy = cy - vh / 2 - (sm.y - 0.5) * 12 / k;

      view.sx = sx; view.sy = sy; view.k = k;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#050506';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.setTransform(DPR * k, 0, 0, DPR * k, -sx * k * DPR, -sy * k * DPR);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
      var flick = reduce ? 1 : 0.94 + Math.sin(t * 7.3) * 0.02 + Math.sin(t * 2.1) * 0.03;
      ctx.globalAlpha = intro * flick;
      var src = hdReady ? hd : img, F = src.naturalWidth / IW;
      var x0 = Math.max(0, Math.floor(sx) - 1), y0 = Math.max(0, Math.floor(sy) - 1);
      var x1 = Math.min(IW, Math.ceil(sx + vw) + 1), y1 = Math.min(IH, Math.ceil(sy + vh) + 1);
      ctx.drawImage(src, x0 * F, y0 * F, (x1 - x0) * F, (y1 - y0) * F, x0, y0, x1 - x0, y1 - y0);

      var pulse = 0.75 + 0.25 * Math.sin(t * 2.2) + 0.08 * Math.sin(t * 5.3);
      var b = Math.min(1.3, cur.burn + charge * 0.9) * pulse;
      if (glowBloom && b > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, b * 1.1) * intro;
        ctx.drawImage(glowBloom, 0, 0, IW, IH);
        ctx.globalAlpha = Math.min(1, b * 0.55) * intro;
        ctx.drawImage(glowSharp, 0, 0, IW, IH);
      }

      var heat = cur.burn + charge;
      if (heat > 0.02 && !reduce) spawn(Math.round((coarse ? 0.7 : 1.8) * heat + Math.random() * 0.6), 1 + charge);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = parts.length - 1; i >= 0; i--) {
        var q = parts[i];
        q.x += q.vx + Math.sin(t * 2 + q.ph) * 0.12; q.y += q.vy; q.life -= q.dec;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = q.life * 0.9;
        ctx.fillStyle = q.life > 0.55 ? '#ffd9a0' : '#ff4a2a';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
      }
      ctx.restore();

      /* "this is him" marker on the climber, fades as the climb begins */
      var hint = (1 - smooth(0, 0.1, p)) * intro;
      if (!fixed && hint > 0.02) {
        var hx = (0.8 * IW - sx) * k, hy = (0.835 * IH - sy) * k;
        var r = (46 + Math.sin(t * 3) * 5) * k * 0.7;
        ctx.globalAlpha = hint;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#c1121f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(hx, hy, r, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx - r, hy); ctx.lineTo(hx - r - 60, hy); ctx.stroke();
        ctx.font = '700 13px "Space Mono", monospace'; ctx.textAlign = 'right';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
        ctx.strokeText('THIS IS HIM', hx - r - 68, hy + 5);
        ctx.fillStyle = '#fff'; ctx.fillText('THIS IS HIM', hx - r - 68, hy + 5);
      }

      /* cursor: ember trail and a warm torch on the picture */
      if (opts.interact && pm.x >= 0) {
        var rc = cv.getBoundingClientRect();
        var mx = pm.x - rc.left, my = pm.y - rc.top;
        if (mx >= 0 && my >= 0 && mx <= W && my <= H) {
          var sp = pm.px < 0 ? 0 : Math.hypot(pm.x - pm.px, pm.y - pm.py);
          if (sp > 2 && !reduce) spawnAt(view.sx + mx / view.k, view.sy + my / view.k, Math.min(5, Math.round(sp / 10)), 1);
          var tr = 150 + charge * 120;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = intro * (0.2 + charge * 0.3);
          ctx.drawImage(torch, mx - tr, my - tr, tr * 2, tr * 2);
        }
        pm.px = pm.x; pm.py = pm.y;
      }

      /* vignette, sides melt into the page, flash on ignite */
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(vig, 0, 0, W, H);
      if (flash > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flash * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        flash *= 0.92;
      }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!active || !ready) return;
      t = now / 1000;
      var dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
      for (var key in target) cur[key] += (target[key] - cur[key]) * (1 - Math.exp(-dt * (key === 'intro' ? 2.6 : 5.5)));
      var fm = 1 - Math.exp(-dt * 4);
      sm.x += (mouse.x - sm.x) * fm; sm.y += (mouse.y - sm.y) * fm;
      charge = charging ? Math.min(1, charge + dt * 0.9) : Math.max(0, charge - dt * 2);
      var d0 = performance.now();
      draw();
      slow = slow * 0.95 + (performance.now() - d0) * 0.05;
      if (slow > 14 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); slow = 0; resize(); }
    }

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv);
    else addEventListener('resize', resize);
    requestAnimationFrame(frame);

    return { target: target, shock: shock, setActive: function (v) { active = v; } };
  }

  window.Scene = { create: create };
})();
