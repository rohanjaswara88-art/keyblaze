/* SOLO — procedural arena scene. Everything is drawn in code: no images. */
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

  function clamp(x, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(x) { return 1 - Math.pow(1 - clamp(x), 3); }

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Shared grain tile for the lit floor.
  var grainTile = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 160;
    var g = c.getContext('2d');
    var im = g.createImageData(160, 160);
    for (var i = 0; i < im.data.length; i += 4) {
      var v = 150 + Math.random() * 105;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c;
  })();

  function create(cv, opts) {
    opts = opts || {};
    var crowd = opts.crowd !== false;
    var ctx = cv.getContext('2d');
    var target = { ring: 1, fall: 0, raise: 0, widen: 0.15, lean: 0.25, intro: 0 };
    if (opts.init) for (var k in opts.init) target[k] = opts.init[k];
    var cur = {};
    for (var k2 in target) cur[k2] = target[k2];

    var shocks = [];
    var sm = { x: 0.5, y: 0.5 };
    var W = 0, H = 0, U = 1, cx = 0, cy = 0, rx = 0, ry = 0, DPR = 1;
    var soldiers = [];
    var active = true;
    var t = 0;
    var pattern = ctx.createPattern(grainTile, 'repeat');

    function build() {
      soldiers = [];
      if (!crowd) return;
      var r = rng(11);
      var rows = coarse
        ? [[1.15, 34], [1.35, 48], [1.6, 64], [1.9, 84]]
        : [[1.15, 52], [1.32, 70], [1.52, 92], [1.76, 120], [2.05, 150]];
      rows.forEach(function (row) {
        var R = row[0], n = row[1];
        for (var i = 0; i < n; i++) {
          soldiers.push({
            R: R * (1 + (r() - 0.5) * 0.05),
            th: ((i + r() * 0.8) / n) * TAU,
            ph: r() * TAU,
            st: r(),
            len: 0.85 + r() * 0.5,
            shield: r() > 0.35,
            h: 0.9 + r() * 0.2
          });
        }
      });
      soldiers.sort(function (a, b) { return Math.sin(a.th) * a.R - Math.sin(b.th) * b.R; });
    }

    function resize() {
      var b = cv.getBoundingClientRect();
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(b.width));
      H = Math.max(1, Math.round(b.height));
      cv.width = W * DPR;
      cv.height = H * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      U = Math.max(0.5, Math.min(H / 820, (W / 900) * 1.4));
      cx = W / 2;
      cy = H * 0.69;
      rx = W < 700 ? W * 0.4 : W * 0.3;
      ry = Math.min(H * 0.2, rx * 0.46);
    }

    function shock() { shocks.push({ t0: t }); if (shocks.length > 4) shocks.shift(); }

    function drawCone(lx, open) {
      var tw = W * 0.09 * (1 + cur.widen * 0.6) * open;
      var bw = rx * (0.8 + 0.4 * cur.widen) * open;
      var g = ctx.createLinearGradient(0, 0, 0, cy);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.7, 'rgba(255,255,255,.92)');
      g.addColorStop(1, 'rgba(255,255,255,.8)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx + lx * 2 - tw, -10);
      ctx.lineTo(cx + lx * 2 + tw, -10);
      ctx.lineTo(cx + lx + bw, cy);
      ctx.lineTo(cx + lx - bw, cy);
      ctx.closePath();
      ctx.fill();
    }

    function drawFloor(lx, open) {
      if (open < 0.01) return;
      var R = rx * 1.1 * open;
      ctx.save();
      ctx.translate(cx + lx, cy);
      ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.55, '#e8e8e4');
      g.addColorStop(0.9, '#9c9c99');
      g.addColorStop(1, 'rgba(120,120,118,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = pattern;
      ctx.fill();
      ctx.restore();
    }

    function drawSoldier(s, open) {
      var th = s.th;
      var rr = s.R * cur.ring;
      var x0 = cx + Math.cos(th) * rx * rr;
      var y0 = cy + Math.sin(th) * ry * rr;
      var depth = (Math.sin(th) + 1) / 2;
      var k = U * (0.4 + 0.62 * depth) * s.h * (1 + (s.R - 1) * 0.1);

      var a = clamp(open * 1.6 - s.st * 0.6);
      if (a <= 0.01) return;
      var f = clamp((cur.fall * 1.45 - s.st * 0.45) / 0.55);

      var push = 0;
      for (var i = 0; i < shocks.length; i++) {
        var age = t - shocks[i].t0;
        if (age < 0 || age > 2.2) continue;
        var d = age * 1.9 - rr;
        push += Math.exp(-(d * d) / 0.03);
      }
      var dx = Math.cos(th) * push * 38 * k;
      var dy = Math.sin(th) * push * 12 * k;
      var side = Math.cos(th) > 0 ? 1 : -1;

      ctx.save();
      ctx.globalAlpha = a * (1 - f * 0.92);
      ctx.translate(x0 + dx, y0 + dy + f * 14 * k + (1 - a) * 30 * k);
      ctx.rotate(f * side * 1.35 + push * side * 0.35);
      ctx.scale(k, k);

      ctx.fillStyle = '#040405';
      ctx.strokeStyle = 'rgba(240,240,235,.3)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(-10, 0); ctx.lineTo(-13, -30);
      ctx.quadraticCurveTo(0, -46, 13, -30);
      ctx.lineTo(10, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();

      ctx.beginPath(); ctx.arc(0, -50, 7, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-1.5, -56); ctx.quadraticCurveTo(0, -68, 6, -60); ctx.lineTo(1.5, -55);
      ctx.fill();

      if (s.shield) {
        ctx.beginPath(); ctx.ellipse(-15, -25, 8, 14, 0.1, 0, TAU); ctx.fill(); ctx.stroke();
      }

      var sway = reduce ? 0 : Math.sin(t * 1.4 + s.ph) * 0.025;
      var lean = -Math.cos(th) * cur.lean * 0.9 + (sm.x - 0.5) * 0.12 + sway - f * 1.1;
      var L = 105 * s.len;
      var sl = Math.sin(lean), cl = Math.cos(lean);
      var bx = 17 - sl * 10, by = -4 + cl * 10;
      var ex = 17 + sl * L, ey = -4 - cl * L;
      ctx.strokeStyle = '#040405';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex + sl * 15, ey - cl * 15);
      ctx.lineTo(ex + cl * 3.4, ey + sl * 3.4);
      ctx.lineTo(ex - cl * 3.4, ey - sl * 3.4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function drawWarrior(x, y, flip, alpha) {
      var sc = U * 1.75;
      var sw = reduce ? 0 : Math.sin(t * 1.8) * 3;
      var br = reduce ? 0 : Math.sin(t * 1.5) * 0.8;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, flip ? -sc * 0.9 : sc);
      ctx.globalAlpha = alpha;

      ctx.fillStyle = '#b3121c';
      ctx.beginPath();
      ctx.moveTo(-12, -98 + br);
      ctx.bezierCurveTo(-30, -84, -44 + sw, -50, -40 + sw * 1.6, -22);
      ctx.lineTo(-30 + sw, -26);
      ctx.lineTo(-22 + sw, -14);
      ctx.lineTo(-12, -58);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-11, -48); ctx.lineTo(0, -48); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(1, -48); ctx.lineTo(12, -48); ctx.lineTo(20, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-14, -44); ctx.lineTo(14, -44); ctx.lineTo(17, -92 + br);
      ctx.quadraticCurveTo(0, -100 + br, -17, -92 + br);
      ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-15, -46); ctx.lineTo(15, -46); ctx.lineTo(18, -30); ctx.lineTo(-18, -30); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -106 + br, 8, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-3, -113 + br);
      ctx.bezierCurveTo(-4, -128, 10, -130, 18 + sw * 0.4, -118);
      ctx.bezierCurveTo(8, -122, 2, -118, 3, -112 + br);
      ctx.fill();

      ctx.save();
      ctx.translate(-27, -68); ctx.rotate(-0.12);
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 23, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();

      var aim = lerp(0.95, -1.3, cur.raise) + clamp((sm.x - 0.5) * 0.7, -0.35, 0.35) - clamp((sm.y - 0.55) * 0.4, -0.2, 0.2);
      var ca = Math.cos(aim), sa = Math.sin(aim);
      var hx = 15 + ca * 20, hy = -86 + sa * 20;
      ctx.strokeStyle = '#000'; ctx.lineCap = 'round';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(14, -90 + br); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(hx - ca * 6, hy - sa * 6); ctx.lineTo(hx + ca * 82, hy + sa * 82); ctx.stroke();
      var gx = hx + ca * 8, gy = hy + sa * 8;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(gx + sa * 8, gy - ca * 8); ctx.lineTo(gx - sa * 8, gy + ca * 8); ctx.stroke();
      ctx.restore();
    }

    function drawShockRings(lx) {
      for (var i = 0; i < shocks.length; i++) {
        var age = t - shocks[i].t0;
        if (age < 0 || age > 2.2) continue;
        var w = age * 1.9;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age / 2.2) * 0.55;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3 * (1 - age / 2.2) + 0.5;
        ctx.beginPath();
        ctx.ellipse(cx + lx, cy, w * rx, w * ry, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    function draw() {
      var open = easeOut(cur.intro);
      var shake = 0;
      for (var i = 0; i < shocks.length; i++) {
        var age = t - shocks[i].t0;
        if (age >= 0 && age < 0.35) shake = Math.max(shake, (1 - age / 0.35) * 7);
      }

      ctx.save();
      if (shake && !reduce) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      ctx.clearRect(-20, -20, W + 40, H + 40);

      var g = ctx.createRadialGradient(cx, cy * 0.8, 10, cx, cy * 0.8, Math.max(W, H) * 0.8);
      g.addColorStop(0, '#17171b');
      g.addColorStop(1, '#050506');
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      var lx = (sm.x - 0.5) * W * 0.03;
      drawCone(lx, open);
      drawFloor(lx, open);
      for (var j = 0; j < soldiers.length; j++) drawSoldier(soldiers[j], open);
      drawShockRings(lx);

      var wy = cy + ry * 0.06;
      drawWarrior(cx + lx * 0.4, wy, true, 0.2 * open);
      drawWarrior(cx + lx * 0.4, wy, false, open);

      var v = ctx.createRadialGradient(cx, H * 0.55, Math.min(W, H) * 0.3, cx, H * 0.55, Math.max(W, H) * 0.85);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,.7)');
      ctx.fillStyle = v;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.restore();
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!active) return;
      t = now / 1000;
      for (var key in target) cur[key] += (target[key] - cur[key]) * (key === 'intro' ? 0.05 : 0.07);
      sm.x += (mouse.x - sm.x) * 0.06;
      sm.y += (mouse.y - sm.y) * 0.06;
      draw();
    }

    build();
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv);
    else addEventListener('resize', resize);
    requestAnimationFrame(frame);

    return {
      target: target,
      shock: shock,
      setActive: function (v) { active = v; }
    };
  }

  window.Scene = { create: create };
})();
