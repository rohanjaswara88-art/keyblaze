/* SOLO — "The Ascent": real animation inside one picture.
   The artwork is a GPU mesh. Wings flap, the climber takes steps, the wings burn.
   Scroll climbs the picture; faster scroll means a faster gait. */
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

  var RATE = 3.4;               // gait speed (radians per second)
  var FLAP_RATE = 2.6;          // wing beat speed

  /* ---------- the artwork ---------- */
  var img = new Image();        // small copy: used to find where the fire is
  var hd = new Image();         // sharp copy: what you actually see
  var IW = 0, IH = 0, ready = false, hdReady = false, embers = [], potCv = null;

  img.onload = function () {
    IW = img.naturalWidth; IH = img.naturalHeight;
    try {
      var c = document.createElement('canvas'); c.width = IW; c.height = IH;
      var x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      var d = x.getImageData(0, 0, IW, IH).data;
      var gw = IW >> 1, gh = IH >> 1;
      for (var y = 0; y < gh; y++) {
        for (var xx = 0; xx < gw; xx++) {
          var lum = d[((y * 2) * IW + xx * 2) * 4];
          var nx = xx / gw, ny = y / gh;
          var dx = (nx - 0.52) / 0.38, dy = (ny - 0.6) / 0.27;
          var reg = Math.max(0, 1 - (dx * dx + dy * dy));
          var a = lum > 175 ? ((lum - 175) / 80) * Math.pow(reg, 0.55) : 0;
          if (a > 0.5 && Math.random() < 0.03) embers.push([nx, ny]);
        }
      }
    } catch (e) { /* pixel access blocked (file://) */ }
    if (!embers.length) embers.push([0.5, 0.6]);
    ready = true;
  };
  img.src = 'media/ascent.jpg';

  hd.onload = function () {
    // power-of-two copy so the GPU can mipmap it (no shimmer when it is scaled down)
    potCv = document.createElement('canvas');
    potCv.width = 2048; potCv.height = 4096;
    var px = potCv.getContext('2d');
    px.imageSmoothingQuality = 'high';
    px.drawImage(hd, 0, 0, 2048, 4096);
    hdReady = true;
  };
  hd.src = 'media/ascent-hd.jpg';

  /* ---------- the warp: identical maths on the GPU (shader) and here (for embers + marker) ---------- */
  function warp(u, v, st) {
    var px = u * IW, py = v * IH, x, y, rx, ry, c, s;
    // wings: flap about the root
    var mw = 1 - smooth(0, 1, Math.hypot((u - 0.52) / 0.40, (v - 0.6) / 0.29));
    var pvx = 0.5 * IW, pvy = 0.79 * IH;
    var d = (px - pvx) / 50, sg = d / (Math.abs(d) + 1);
    var a = st.flap * (-sg) * mw;
    rx = px - pvx; ry = py - pvy; c = Math.cos(a); s = Math.sin(a);
    x = pvx + rx * c - ry * s; y = pvy + rx * s + ry * c;
    // climber: bob, step, lean
    var mc = 1 - smooth(0, 1, Math.hypot((u - 0.80) / 0.15, (v - 0.85) / 0.11));
    var ph = st.t * RATE, up = clamp((0.92 - v) / 0.12, 0, 1);
    y += -Math.sin(ph * 2) * 6 * st.gait * mc * (0.4 + 0.6 * up);
    x += Math.sin(ph) * 10 * st.gait * mc * (1 - up);
    var qx = 0.77 * IW, qy = 0.925 * IH, a2 = 0.05 * Math.sin(ph) * st.gait * mc;
    rx = x - qx; ry = y - qy; c = Math.cos(a2); s = Math.sin(a2);
    return [qx + rx * c - ry * s, qy + rx * s + ry * c];
  }

  var VS = [
    'attribute vec2 a_uv;',
    'uniform vec2 u_img; uniform vec2 u_view; uniform vec3 u_cam;',
    'uniform float u_t; uniform float u_flap; uniform float u_gait; uniform float u_rate;',
    'varying vec2 v_uv;',
    'void main(){',
    '  v_uv = a_uv;',
    '  vec2 p = a_uv * u_img;',
    '  float mw = 1.0 - smoothstep(0.0, 1.0, length((a_uv - vec2(0.52, 0.6)) / vec2(0.40, 0.29)));',
    '  vec2 pv = vec2(0.5, 0.79) * u_img;',
    '  float d = (p.x - pv.x) / 50.0;',
    '  float a = u_flap * (-(d / (abs(d) + 1.0))) * mw;',
    '  vec2 r = p - pv;',
    '  p = pv + vec2(r.x * cos(a) - r.y * sin(a), r.x * sin(a) + r.y * cos(a));',
    '  float mc = 1.0 - smoothstep(0.0, 1.0, length((a_uv - vec2(0.80, 0.85)) / vec2(0.15, 0.11)));',
    '  float ph = u_t * u_rate;',
    '  float up = clamp((0.92 - a_uv.y) / 0.12, 0.0, 1.0);',
    '  p.y += -sin(ph * 2.0) * 6.0 * u_gait * mc * (0.4 + 0.6 * up);',
    '  p.x += sin(ph) * 10.0 * u_gait * mc * (1.0 - up);',
    '  vec2 q = vec2(0.77, 0.925) * u_img;',
    '  float a2 = 0.05 * sin(ph) * u_gait * mc;',
    '  r = p - q;',
    '  p = q + vec2(r.x * cos(a2) - r.y * sin(a2), r.x * sin(a2) + r.y * cos(a2));',
    '  vec2 s = (p - u_cam.xy) * u_cam.z;',
    '  gl_Position = vec4(s.x / u_view.x * 2.0 - 1.0, 1.0 - s.y / u_view.y * 2.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v_uv;',
    'uniform sampler2D u_tex; uniform float u_t; uniform float u_burn; uniform float u_alpha;',
    'uniform vec2 u_res;',
    'void main(){',
    '  vec2 uv = v_uv;',
    '  vec2 dw = (uv - vec2(0.52, 0.6)) / vec2(0.38, 0.27);',
    '  float m = pow(max(0.0, 1.0 - dot(dw, dw)), 0.55);',
    '  uv += u_burn * m * 0.0016 * vec2(sin(uv.y * 90.0 + u_t * 3.1), cos(uv.x * 70.0 + u_t * 2.7));',
    '  vec3 c = texture2D(u_tex, uv).rgb;',
    '  float core = smoothstep(0.69, 1.0, c.r) * m;',
    '  float bloom = texture2D(u_tex, uv, 5.0).r * m;',
    '  vec3 heat = vec3(1.0, 0.38, 0.18);',
    '  c += heat * (bloom * 0.55 + core * 0.4) * u_burn;',
    '  c = mix(c, vec3(1.0, 0.92, 0.8), core * u_burn * 0.25);',
    '  vec2 q = gl_FragCoord.xy / u_res;',
    '  float vg = smoothstep(0.3, 0.95, length((q - vec2(0.5, 0.45)) * vec2(1.0, 0.95))) * 0.8;',
    '  gl_FragColor = vec4(c * (1.0 - vg) * u_alpha, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function makeGL(cv) {
    var gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    try {
      var pr = gl.createProgram();
      gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);

      var COLS = coarse ? 36 : 56, ROWS = coarse ? 64 : 100;
      var uv = new Float32Array((COLS + 1) * (ROWS + 1) * 2), n = 0;
      for (var j = 0; j <= ROWS; j++) for (var i = 0; i <= COLS; i++) { uv[n++] = i / COLS; uv[n++] = j / ROWS; }
      var idx = new Uint16Array(COLS * ROWS * 6), q = 0;
      for (var j2 = 0; j2 < ROWS; j2++) for (var i2 = 0; i2 < COLS; i2++) {
        var a = j2 * (COLS + 1) + i2, b = a + 1, c = a + COLS + 1, d = c + 1;
        idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
      }
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, 'a_uv'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

      var U = {};
      ['u_img', 'u_view', 'u_cam', 'u_t', 'u_flap', 'u_gait', 'u_rate', 'u_tex', 'u_burn', 'u_alpha', 'u_res'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
      return { gl: gl, U: U, count: idx.length, tex: null };
    } catch (e) {
      if (window.console) console.warn('SOLO: WebGL unavailable, using flat picture.', e);
      return null;
    }
  }

  function uploadTexture(g) {
    var gl = g.gl;
    g.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, potCv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    gl.uniform1i(g.U.u_tex, 0);
  }

  var torch = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 256;
    var x = c.getContext('2d'); var g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,150,80,1)'); g.addColorStop(1, 'rgba(255,80,40,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256); return c;
  })();

  /* ---------- scene ---------- */
  function create(cv, opts) {
    opts = opts || {};
    var target = { pan: 0, burn: 0, intro: 0 };
    if (opts.init) for (var k in opts.init) target[k] = opts.init[k];
    var cur = {}; for (var k2 in target) cur[k2] = target[k2];

    // overlay canvas for embers, torch, marker and flash (blended additively over the picture)
    var fxc = document.createElement('canvas');
    fxc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;display:block';
    cv.parentNode.insertBefore(fxc, cv.nextSibling);
    var fx = fxc.getContext('2d');

    var g = makeGL(cv);
    var flat = null;
    if (!g) { fxc.style.mixBlendMode = 'normal'; flat = fx; }

    var W = 1, H = 1, DPR = 1, t = 0, lastT = 0, flash = 0, active = true, parts = [];
    var sm = { x: 0.5, y: 0.5 };
    var charge = 0, charging = false, vel = 0, prevPan = cur.pan, slowT = 0, slowN = 0;
    var pm = { x: -1, y: -1, px: -1, py: -1 };
    var view = { sx: 0, sy: 0, k: 1 };
    var dprCap = Math.min(devicePixelRatio || 1, 1.75);
    var st = { t: 0, flap: 0, gait: 1 };

    function resize() {
      var b = cv.getBoundingClientRect();
      DPR = dprCap;
      W = Math.max(1, Math.round(b.width)); H = Math.max(1, Math.round(b.height));
      cv.width = fxc.width = Math.round(W * DPR);
      cv.height = fxc.height = Math.round(H * DPR);
    }

    function spawn(n, power) {
      if (!embers.length) return;
      for (var i = 0; i < n; i++) {
        var e = embers[(Math.random() * embers.length) | 0];
        var p = warp(e[0], e[1], st);
        parts.push({
          x: p[0], y: p[1],
          vx: (Math.random() - 0.5) * 0.5 * power, vy: -(0.35 + Math.random() * 1.1) * power,
          r: 0.8 + Math.random() * 2.2, life: 1, dec: 0.006 + Math.random() * 0.012, ph: Math.random() * TAU
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

    function render(dt) {
      var intro = 1 - Math.pow(1 - clamp(cur.intro, 0, 1), 3);
      var p = cur.pan, fixed = opts.fixed;

      var base = Math.max(W / IW, H / IH);
      var zoom = fixed ? 1.04 : 1 + 0.1 * smooth(0.75, 1, p);
      zoom *= 1 + (1 - intro) * 0.22 + (reduce ? 0 : Math.sin(t * 0.6) * 0.006) + charge * 0.05;
      var k = base * zoom;
      var vw = W / k, vh = H / k;
      var fyStart = 0.835 - 0.22 * (vh / IH);
      var fy = fixed ? fixed : fyStart + (0.56 - fyStart) * easeIO(clamp(p / 0.8, 0, 1)) - 0.05 * smooth(0.8, 1, p);
      var fx0 = fixed ? 0.5 : 0.5 + 0.3 * (1 - smooth(0, 0.4, p));
      var cx = clamp(fx0 * IW, Math.min(vw / 2, IW / 2), Math.max(IW - vw / 2, IW / 2));
      var cy = clamp(fy * IH, Math.min(vh / 2, IH / 2), Math.max(IH - vh / 2, IH / 2));
      var sx = cx - vw / 2 - (sm.x - 0.5) * 18 / k;
      var sy = cy - vh / 2 - (sm.y - 0.5) * 12 / k;
      view.sx = sx; view.sy = sy; view.k = k;

      var heatBase = Math.min(1.3, cur.burn + charge * 0.9);
      var pulse = 0.75 + 0.25 * Math.sin(t * 2.2) + 0.08 * Math.sin(t * 5.3);
      var motion = reduce ? 0.25 : 1;
      st.t = t;
      st.flap = motion * (0.035 + 0.12 * heatBase) * (Math.sin(t * FLAP_RATE) + 0.3 * Math.sin(t * FLAP_RATE * 2 + 1));
      st.gait = reduce ? 0.3 : 1 + Math.min(2, vel * 7);
      var flick = reduce ? 1 : 0.94 + Math.sin(t * 7.3) * 0.02 + Math.sin(t * 2.1) * 0.03;

      if (g) {
        var gl = g.gl, U = g.U;
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0.02, 0.02, 0.024, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.u_img, IW, IH);
        gl.uniform2f(U.u_view, W, H);
        gl.uniform3f(U.u_cam, sx, sy, k);
        gl.uniform1f(U.u_t, t);
        gl.uniform1f(U.u_flap, st.flap);
        gl.uniform1f(U.u_gait, st.gait);
        gl.uniform1f(U.u_rate, RATE);
        gl.uniform1f(U.u_burn, heatBase * pulse);
        gl.uniform1f(U.u_alpha, intro * flick);
        gl.uniform2f(U.u_res, cv.width, cv.height);
        gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_SHORT, 0);
      }

      /* overlay */
      fx.setTransform(DPR, 0, 0, DPR, 0, 0);
      fx.globalCompositeOperation = 'source-over';
      fx.globalAlpha = 1;
      if (flat) { fx.fillStyle = '#050506'; fx.fillRect(0, 0, W, H); }
      else fx.clearRect(0, 0, W, H);

      if (flat && hdReady) {
        fx.save();
        fx.setTransform(DPR * k, 0, 0, DPR * k, -sx * k * DPR, -sy * k * DPR);
        fx.globalAlpha = intro; fx.drawImage(hd, 0, 0, IW, IH);
        fx.restore();
      }

      var heat = cur.burn + charge;
      if (heat > 0.02 && !reduce) spawn(Math.round((coarse ? 0.7 : 1.8) * heat + Math.random() * 0.6), 1 + charge);

      fx.save();
      fx.setTransform(DPR * k, 0, 0, DPR * k, -sx * k * DPR, -sy * k * DPR);
      fx.globalCompositeOperation = 'lighter';
      for (var i = parts.length - 1; i >= 0; i--) {
        var q = parts[i];
        q.x += q.vx + Math.sin(t * 2 + q.ph) * 0.12; q.y += q.vy; q.life -= q.dec;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        fx.globalAlpha = q.life * 0.9 * intro;
        fx.fillStyle = q.life > 0.55 ? '#ffd9a0' : '#ff4a2a';
        fx.beginPath(); fx.arc(q.x, q.y, q.r, 0, TAU); fx.fill();
      }
      fx.restore();

      /* marker on the climber, fades as the climb begins */
      var hint = (1 - smooth(0, 0.1, p)) * intro;
      if (!fixed && hint > 0.02) {
        var hp = warp(0.8, 0.835, st);
        var hx = (hp[0] - sx) * k, hy = (hp[1] - sy) * k;
        var r = (46 + Math.sin(t * 3) * 5) * k * 0.7;
        fx.globalCompositeOperation = 'source-over';
        fx.globalAlpha = hint;
        fx.strokeStyle = '#c1121f'; fx.lineWidth = 2;
        fx.beginPath(); fx.arc(hx, hy, r, 0, TAU); fx.stroke();
        fx.beginPath(); fx.moveTo(hx - r, hy); fx.lineTo(hx - r - 60, hy); fx.stroke();
        fx.font = '700 13px "Space Mono", monospace'; fx.textAlign = 'right';
        fx.lineWidth = 4; fx.strokeStyle = '#000'; fx.lineJoin = 'round';
        fx.strokeText('THIS IS HIM', hx - r - 68, hy + 5);
        fx.fillStyle = '#fff'; fx.fillText('THIS IS HIM', hx - r - 68, hy + 5);
      }

      /* cursor: ember trail and a warm torch */
      if (opts.interact && pm.x >= 0) {
        var rc = cv.getBoundingClientRect();
        var mx = pm.x - rc.left, my = pm.y - rc.top;
        if (mx >= 0 && my >= 0 && mx <= W && my <= H) {
          var sp = pm.px < 0 ? 0 : Math.hypot(pm.x - pm.px, pm.y - pm.py);
          if (sp > 2 && !reduce) spawnAt(sx + mx / k, sy + my / k, Math.min(5, Math.round(sp / 10)), 1);
          var tr = 150 + charge * 120;
          fx.globalCompositeOperation = 'lighter'; fx.globalAlpha = intro * (0.2 + charge * 0.3);
          fx.drawImage(torch, mx - tr, my - tr, tr * 2, tr * 2);
        }
        pm.px = pm.x; pm.py = pm.y;
      }

      if (flash > 0.01) {
        fx.globalCompositeOperation = 'lighter';
        fx.globalAlpha = flash * 0.6; fx.fillStyle = '#fff'; fx.fillRect(0, 0, W, H);
        flash *= 0.92;
      }
    }

    function frame(now) {
      requestAnimationFrame(frame);
      if (!active || !ready || !hdReady) return;
      if (g && !g.tex) uploadTexture(g);
      t = now / 1000;
      var dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
      for (var key in target) cur[key] += (target[key] - cur[key]) * (1 - Math.exp(-dt * (key === 'intro' ? 2.6 : 5.5)));
      var fm = 1 - Math.exp(-dt * 4);
      sm.x += (mouse.x - sm.x) * fm; sm.y += (mouse.y - sm.y) * fm;
      charge = charging ? Math.min(1, charge + dt * 0.9) : Math.max(0, charge - dt * 2);
      var inst = dt > 0 ? Math.abs(cur.pan - prevPan) / dt : 0; prevPan = cur.pan;
      vel += (inst - vel) * (1 - Math.exp(-dt * 6));
      render(dt);

      // if frames are consistently slow, drop to a lighter resolution once
      slowT += dt; slowN++;
      if (slowN >= 90) {
        if (slowT / slowN > 0.034 && dprCap > 1) { dprCap = 1; resize(); }
        slowT = 0; slowN = 0;
      }
    }

    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv);
    else addEventListener('resize', resize);
    requestAnimationFrame(frame);

    return { target: target, shock: shock, setActive: function (v) { active = v; } };
  }

  window.Scene = { create: create };
})();
