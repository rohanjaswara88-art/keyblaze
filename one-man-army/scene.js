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

  /* ---------- load the picture once, prepare glow layers ---------- */
  var img = new Image();
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

  /* ---------- scene ---------- */
  function create(cv, opts) {
    opts = opts || {};
    var ctx = cv.getContext('2d');
    var target = { pan: 0, burn: 0, intro: 0 };
    if (opts.init) for (var k in opts.init) target[k] = opts.init[k];
    var cur = {}; for (var k2 in target) cur[k2] = target[k2];

    var W = 1, H = 1, DPR = 1, t = 0, flash = 0, active = true, parts = [];
    var sm = { x: 0.5, y: 0.5 };

    function resize() {
      var b = cv.getBoundingClientRect();
      DPR = Math.min(devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(b.width)); H = Math.max(1, Math.round(b.height));
      cv.width = W * DPR; cv.height = H * DPR;
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
      if (parts.length > 700) parts.splice(0, parts.length - 700);
    }

    function shock() { flash = 1; spawn(coarse ? 90 : 220, 2.4); }

    function draw() {
      var intro = 1 - Math.pow(1 - clamp(cur.intro, 0, 1), 3);
      var p = cur.pan;
      var fixed = opts.fixed;

      var base = Math.max(Math.min(W, 1000) / IW, H / IH);
      var zoom = fixed ? 1.04 : 1.2 - 0.2 * smooth(0, 0.5, p) + 0.12 * smooth(0.72, 1, p);
      zoom *= 1 + (1 - intro) * 0.22 + (reduce ? 0 : Math.sin(t * 0.6) * 0.006);
      var k = base * zoom;
      var vw = W / k, vh = H / k;

      var fy = fixed ? fixed : 0.86 - 0.31 * easeIO(clamp(p / 0.8, 0, 1)) - 0.05 * smooth(0.8, 1, p);
      var fx = fixed ? 0.5 : 0.5 + 0.3 * (1 - smooth(0, 0.4, p));
      var cx = clamp(fx * IW, Math.min(vw / 2, IW / 2), Math.max(IW - vw / 2, IW / 2));
      var cy = clamp(fy * IH, Math.min(vh / 2, IH / 2), Math.max(IH - vh / 2, IH / 2));
      var sx = cx - vw / 2 - (sm.x - 0.5) * 18 / k;
      var sy = cy - vh / 2 - (sm.y - 0.5) * 12 / k;

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#050506';
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.setTransform(DPR * k, 0, 0, DPR * k, -sx * k * DPR, -sy * k * DPR);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      var flick = reduce ? 1 : 0.94 + Math.sin(t * 7.3) * 0.02 + Math.sin(t * 2.1) * 0.03;
      ctx.globalAlpha = intro * flick;
      ctx.drawImage(img, 0, 0);

      var pulse = 0.75 + 0.25 * Math.sin(t * 2.2) + 0.08 * Math.sin(t * 5.3);
      var b = cur.burn * pulse;
      if (glowBloom && b > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, b * 1.1) * intro;
        ctx.drawImage(glowBloom, 0, 0, IW, IH);
        ctx.globalAlpha = Math.min(1, b * 0.55) * intro;
        ctx.drawImage(glowSharp, 0, 0, IW, IH);
      }

      if (cur.burn > 0.02 && !reduce) spawn(Math.round((coarse ? 0.7 : 1.8) * cur.burn + Math.random() * 0.6), 1);
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

      /* vignette, sides melt into the page, flash on ignite */
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      var v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      v.addColorStop(0, 'rgba(5,5,6,0)'); v.addColorStop(1, 'rgba(5,5,6,.78)');
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
      var sidew = Math.max(0, (W - IW * k) / 2);
      if (sidew > 1) {
        var gl = ctx.createLinearGradient(sidew, 0, sidew + 90, 0);
        gl.addColorStop(0, '#050506'); gl.addColorStop(1, 'rgba(5,5,6,0)');
        ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, sidew, H);
        ctx.fillStyle = gl; ctx.fillRect(sidew, 0, 90, H);
        var gr = ctx.createLinearGradient(W - sidew - 90, 0, W - sidew, 0);
        gr.addColorStop(0, 'rgba(5,5,6,0)'); gr.addColorStop(1, '#050506');
        ctx.fillStyle = gr; ctx.fillRect(W - sidew - 90, 0, 90, H);
        ctx.fillStyle = '#050506'; ctx.fillRect(W - sidew, 0, sidew, H);
      }
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
      for (var key in target) cur[key] += (target[key] - cur[key]) * (key === 'intro' ? 0.045 : 0.08);
      sm.x += (mouse.x - sm.x) * 0.06; sm.y += (mouse.y - sm.y) * 0.06;
      draw();
    }

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv);
    else addEventListener('resize', resize);
    requestAnimationFrame(frame);

    return { target: target, shock: shock, setActive: function (v) { active = v; } };
  }

  window.Scene = { create: create };
})();
