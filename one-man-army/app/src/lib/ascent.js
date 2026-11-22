/* SOLO — "The Ascent": layered animation of one picture.
   Layers: background (+ an extension of the slope), two wings, and the climber in five parts.
   - The climber stays put on screen; the mountain slides down and away beneath him (a treadmill).
   - His wings are attached to his shoulders and follow him with spring physics.
   - After the climb he lifts off toward the star.
   - Wind sways his bag, snow falls. */

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

  var BASE = import.meta.env.BASE_URL + 'media/';
  var IW = 736, IH = 1308;        // logical size of the picture
  var IWE = IW + 260;             // plus the extension of the slope on the right
  var WING_REACH = 260;
  var WING_SCALE = 0.72;          // wings are scaled to fit his back
  var SHOULDER = [589, 1051];     // where the wings attach (world, logical px)
  var P0 = [581, 1104];           // climber centre at the start
  var PC = [706, 1050];           // path control: along the slope
  var PS = [396, 930];            // the star: where he ends up
  var STRIDE = 15;                // ground travelled per full step cycle
  var LAYERS = ['base', 'baseR', 'wingL', 'wingR', 'wingLr', 'wingRr', 'cLegL', 'cLegR', 'cTorso', 'cPack', 'cStrap'];
  var FILE = { base: 'base-hd.jpg', baseR: 'baseR.jpg' };

  /* ---------- assets ---------- */
  var ready = false, embers = [], meta = null, pots = {};

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('load ' + src)); }; im.src = src;
    });
  }
  function pot(n) { var p = 1; while (p < n) p <<= 1; return p; }
  function toPot(im) {
    var c = document.createElement('canvas');
    c.width = pot(im.naturalWidth); c.height = pot(im.naturalHeight);
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0);
    return { cv: c, ts: [im.naturalWidth / c.width, im.naturalHeight / c.height], im: im };
  }

  var jobs = [loadImage(BASE + 'ascent.jpg'), fetch(BASE + 'layers.json').then(function (r) { return r.json(); })];
  LAYERS.forEach(function (n) { jobs.push(loadImage(BASE + (FILE[n] || n + '.png'))); });

  Promise.all(jobs).then(function (r) {
    var small = r[0]; meta = r[1];
    meta.wingLr = meta.wingL; meta.wingRr = meta.wingR;   // the finale uses outline-free copies that sit over the body
    LAYERS.forEach(function (n, i) {
      var im = r[2 + i];
      if (n === 'base') {
        var bc = document.createElement('canvas'); bc.width = 2048; bc.height = 4096;
        var bx = bc.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(im, 0, 0, 2048, 4096);
        pots[n] = { cv: bc, ts: [1, 1], im: im };
      } else pots[n] = toPot(im);
    });
    try {   // where the fire is: used to place embers
      var c = document.createElement('canvas'); c.width = IW; c.height = IH;
      var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(small, 0, 0);
      var d = x.getImageData(0, 0, IW, IH).data, gw = IW >> 1, gh = IH >> 1;
      for (var y = 0; y < gh; y++) for (var xx = 0; xx < gw; xx++) {
        var lum = d[((y * 2) * IW + xx * 2) * 4], nx = xx / gw, ny = y / gh;
        var dx = (nx - 0.52) / 0.38, dy = (ny - 0.6) / 0.27, reg = Math.max(0, 1 - (dx * dx + dy * dy));
        var a = lum > 175 ? ((lum - 175) / 80) * Math.pow(reg, 0.55) : 0;
        if (a > 0.5 && Math.random() < 0.03) embers.push([nx * IW, ny * IH]);
      }
    } catch (e) { /* file:// blocks pixel reads */ }
    if (!embers.length) embers.push([0.5 * IW, 0.6 * IH]);
    ready = true;
  }).catch(function (e) { if (window.console) console.warn('SOLO: could not load artwork layers', e); });

  /* ---------- the climber's path: along the slope, then up to the star ---------- */
  function bez(u) {
    var a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    return [a * P0[0] + b * PC[0] + c * PS[0], a * P0[1] + b * PC[1] + c * PS[1]];
  }
  var ARC = [0], ARCN = 240;
  (function () {
    var prev = bez(0);
    for (var i = 1; i <= ARCN; i++) { var q = bez(i / ARCN); ARC.push(ARC[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q; }
  })();
  function arcAt(u) { var f = clamp(u, 0, 1) * ARCN, i = Math.min(ARCN - 1, Math.floor(f)); return ARC[i] + (ARC[i + 1] - ARC[i]) * (f - i); }
  var pathU = function (p) { return easeIO(clamp(p / 0.9, 0, 1)) * 0.5 + clamp(p / 0.9, 0, 1) * 0.5; };   // gentle ease, never stalls

  /* ---------- motion helpers ---------- */
  function flapWave(t, period) {   // slow lift, firmer downstroke
    var u = (t / period) % 1;
    if (u < 0.62) return -1 + 2 * easeIO(u / 0.62);
    var x = (u - 0.62) / 0.38;
    return 1 - 2 * (x * x * (3 - 2 * x));
  }
  function windAt(t) {
    var gust = Math.pow(Math.max(0, Math.sin(t * 0.23 + 1.3)), 3) * 0.55;
    return clamp(0.5 + 0.22 * Math.sin(t * 0.7) + 0.18 * Math.sin(t * 1.9 + 1) + gust, 0.15, 1.25);
  }

  /* ---------- shaders: each layer is a mesh that can rotate about a pivot, scale, shift and ripple like cloth ---------- */
  var VS = [
    'attribute vec2 a_uv;',
    'uniform vec4 u_rect; uniform vec2 u_view; uniform vec3 u_cam;',
    'uniform float u_t; uniform float u_ang; uniform float u_reach; uniform float u_bend; uniform float u_scale;',
    'uniform vec2 u_pivot; uniform vec2 u_tr;',
    'uniform vec2 u_wdir; uniform float u_wamp; uniform float u_wfreq; uniform float u_wspeed;',
    'varying vec2 v_uv; varying vec2 v_p;',
    'void main(){',
    '  v_uv = a_uv;',
    '  vec2 p = u_rect.xy + a_uv * u_rect.zw;',
    '  v_p = p;',
    '  vec2 d = p - u_pivot;',
    '  float r = length(d);',
    '  float s = clamp(r / u_reach, 0.0, 1.0);',
    '  float a = u_ang * ((1.0 - u_bend) + u_bend * s);',
    '  p = u_pivot + u_tr + u_scale * vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));',
    '  p += u_wdir * u_wamp * sin(r * u_wfreq - u_t * u_wspeed) * s * s;',
    '  vec2 s2 = (p - u_cam.xy) * u_cam.z;',
    '  gl_Position = vec4(s2.x / u_view.x * 2.0 - 1.0, 1.0 - s2.y / u_view.y * 2.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'varying vec2 v_uv; varying vec2 v_p;',
    'uniform sampler2D u_tex; uniform vec2 u_ts;',
    'uniform float u_burn; uniform float u_alpha; uniform float u_ga; uniform vec2 u_res;',
    'void main(){',
    '  vec2 ip = v_p / vec2(736.0, 1308.0);',
    '  vec2 dw = (ip - vec2(0.52, 0.6)) / vec2(0.38, 0.27);',
    '  float m = pow(max(0.0, 1.0 - dot(dw, dw)), 0.55);',
    '  vec4 tx = texture2D(u_tex, v_uv * u_ts);',
    '  float a = tx.a;',
    '  float lum = tx.r / max(a, 0.001);',
    '  float core = smoothstep(0.69, 1.0, lum) * m * a;',
    '  vec3 c = tx.rgb * mix(vec3(1.0), vec3(1.0, 0.84, 0.72), clamp(m * u_burn * 0.5, 0.0, 1.0));',
    '  c += vec3(1.0, 0.45, 0.2) * core * u_burn * 0.22;',
    '  c = mix(c, vec3(1.0, 0.92, 0.8) * a, core * u_burn * 0.2);',
    '  vec2 q = gl_FragCoord.xy / u_res;',
    '  float vg = smoothstep(0.35, 1.0, length((q - vec2(0.5, 0.45)) * vec2(1.0, 0.95))) * 0.7;',
    '  gl_FragColor = vec4(c * (1.0 - vg) * u_alpha * u_ga, a * u_ga);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function mesh(gl, cols, rows) {
    var uv = new Float32Array((cols + 1) * (rows + 1) * 2), n = 0;
    for (var j = 0; j <= rows; j++) for (var i = 0; i <= cols; i++) { uv[n++] = i / cols; uv[n++] = j / rows; }
    var idx = new Uint16Array(cols * rows * 6), q = 0;
    for (var j2 = 0; j2 < rows; j2++) for (var i2 = 0; i2 < cols; i2++) {
      var a = j2 * (cols + 1) + i2, b = a + 1, c = a + cols + 1, d = c + 1;
      idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = b; idx[q++] = d; idx[q++] = c;
    }
    var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    var ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    return { vb: vb, ib: ib, count: idx.length };
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
      var U = {};
      ['u_rect', 'u_view', 'u_cam', 'u_t', 'u_ang', 'u_reach', 'u_bend', 'u_scale', 'u_pivot', 'u_tr', 'u_wdir', 'u_wamp', 'u_wfreq', 'u_wspeed',
        'u_tex', 'u_ts', 'u_burn', 'u_alpha', 'u_ga', 'u_res'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      return { gl: gl, U: U, loc: gl.getAttribLocation(pr, 'a_uv'), tex: null, meshFlat: mesh(gl, 2, 2), meshPart: mesh(gl, 28, 28) };
    } catch (e) {
      if (window.console) console.warn('SOLO: WebGL unavailable, showing the flat picture.', e);
      return null;
    }
  }

  function uploadTextures(g) {
    var gl = g.gl, ext = gl.getExtension('EXT_texture_filter_anisotropic');
    g.tex = {};
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    LAYERS.forEach(function (name) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pots[name].cv);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      g.tex[name] = t;
    });
    gl.uniform1i(g.U.u_tex, 0);
  }

  function sprite(inner, mid) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, inner); g.addColorStop(0.35, mid); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c;
  }
  var torch = sprite('rgba(255,150,80,1)', 'rgba(255,120,60,.55)');
  var flake = sprite('rgba(255,255,255,1)', 'rgba(235,243,255,.85)');

  /* ---------- scene ---------- */
  function create(cv, opts) {
    opts = opts || {};
    var fixed = !!opts.fixed;
    var target = { pan: 0, burn: 0, intro: 0 };
    if (opts.init) for (var k in opts.init) target[k] = opts.init[k];
    var cur = {}; for (var k2 in target) cur[k2] = target[k2];

    var fxc = document.createElement('canvas');
    fxc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;display:block';
    cv.parentNode.insertBefore(fxc, cv.nextSibling);
    var fx = fxc.getContext('2d');

    var g = makeGL(cv);
    if (!g) fxc.style.mixBlendMode = 'normal';

    var W = 1, H = 1, DPR = 1, t = 0, lastT = 0, flash = 0, active = true, parts = [];
    var sm = { x: 0.5, y: 0.5 };
    var charge = 0, charging = false, vel = 0, speed = 0, prevPan = cur.pan, slowT = 0, slowN = 0, camX = null, camY = null;
    var pm = { x: -1, y: -1, px: -1, py: -1 };
    var dprCap = Math.min(devicePixelRatio || 1, 1.75);
    var snow = [], streaks = [];

    // spring physics for the wings and their roots
    var phys = { L: { a: 0, w: 0, K: 58, C: 7.2 }, R: { a: 0, w: 0, K: 64, C: 7.8 }, root: { x: 0, y: 0, vx: 0, vy: 0, init: false }, bend: 0.6 };
    var wingPose = { L: { ang: 0, ax: 0, ay: 0, sc: 1 }, R: { ang: 0, ax: 0, ay: 0, sc: 1 } };

    function resize() {
      var b = cv.getBoundingClientRect();
      DPR = dprCap;
      W = Math.max(1, Math.round(b.width)); H = Math.max(1, Math.round(b.height));
      cv.width = fxc.width = Math.round(W * DPR);
      cv.height = fxc.height = Math.round(H * DPR);
      initWeather();
    }
    function initWeather() {
      snow = [];
      var n = Math.round((coarse ? 70 : 150) * Math.min(1.4, (W * H) / (1200 * 700)));
      for (var i = 0; i < n; i++) snow.push({ x: Math.random() * W, y: Math.random() * H, z: 0.25 + Math.random() * 0.75, ph: Math.random() * TAU });
      streaks = [];
      for (var j = 0; j < (coarse ? 6 : 12); j++) streaks.push({ x: Math.random() * W * 1.4 - W * 0.2, y: Math.random() * H, len: 120 + Math.random() * 240, sp: 0.6 + Math.random() * 0.8 });
    }

    // where a point of the picture is right now (used to emit embers from the wings)
    function wingPoint(x, y) {
      var side = null;
      if (x >= 0.516 * IW && y < 0.57 * IH) side = 'R'; else if (x < 0.516 * IW && y < 0.61 * IH) side = 'L';
      if (!side || !meta) return [x, y];
      var m = meta[side === 'L' ? 'wingL' : 'wingR'], wp = wingPose[side];
      var dx = x - m.px, dy = y - m.py, s = clamp(Math.hypot(dx, dy) / WING_REACH, 0, 1);
      var a = wp.ang * ((1 - phys.bend) + phys.bend * s), c = Math.cos(a), sn = Math.sin(a);
      return [wp.ax + wp.sc * (dx * c - dy * sn), wp.ay + wp.sc * (dx * sn + dy * c)];
    }
    function spawn(n, power) {
      if (!embers.length) return;
      for (var i = 0; i < n; i++) {
        var e = embers[(Math.random() * embers.length) | 0], p = wingPoint(e[0], e[1]);
        parts.push({ x: p[0], y: p[1], vx: (Math.random() - 0.5) * 0.5 * power, vy: -(0.35 + Math.random() * 1.1) * power, r: 0.8 + Math.random() * 2.2, life: 1, dec: 0.006 + Math.random() * 0.012, ph: Math.random() * TAU });
      }
      if (parts.length > 420) parts.splice(0, parts.length - 420);
    }
    function spawnAt(ix, iy, n, power) {
      for (var i = 0; i < n; i++) {
        parts.push({ x: ix + (Math.random() - 0.5) * 6, y: iy + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 1.4 * power, vy: -(0.2 + Math.random() * 0.9) * power, r: 0.7 + Math.random() * 1.6, life: 0.8, dec: 0.014 + Math.random() * 0.02, ph: Math.random() * TAU });
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
      addEventListener('pointerdown', function (e) { if (!active || e.target.closest('a,button')) return; charging = true; });
      var release = function () { if (!charging) return; charging = false; shock(Math.max(0.35, charge)); charge = 0; };
      addEventListener('pointerup', release);
      addEventListener('pointercancel', release);
    }

    function drawLayer(name, o, camU, ga) {
      var gl = g.gl, U = g.U, mt = meta[name], p = pots[name];
      var flat = name === 'base' || name === 'baseR';
      var m = flat ? g.meshFlat : g.meshPart;
      var rect = name === 'base' ? [0, 0, IW, IH] : [mt.x, mt.y, mt.w, mt.h];
      gl.bindTexture(gl.TEXTURE_2D, g.tex[name]);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
      gl.enableVertexAttribArray(g.loc); gl.vertexAttribPointer(g.loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
      gl.uniform4f(U.u_rect, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform2f(U.u_ts, p.ts[0], p.ts[1]);
      gl.uniform2f(U.u_pivot, mt ? mt.px : 0, mt ? mt.py : 0);
      gl.uniform1f(U.u_reach, (mt && mt.reach) || WING_REACH);
      gl.uniform1f(U.u_ang, o.ang || 0);
      gl.uniform1f(U.u_bend, o.bend === undefined ? 0.5 : o.bend);
      gl.uniform1f(U.u_scale, o.sc === undefined ? 1 : o.sc);
      gl.uniform2f(U.u_tr, o.tx || 0, o.ty || 0);
      gl.uniform2f(U.u_wdir, o.wx || 0, o.wy || 1);
      gl.uniform1f(U.u_wamp, o.wamp || 0);
      gl.uniform1f(U.u_wfreq, o.wfreq || 0.1);
      gl.uniform1f(U.u_wspeed, o.wspeed || 6);
      gl.uniform1f(U.u_alpha, camU);
      gl.uniform1f(U.u_ga, ga === undefined ? 1 : ga);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }

    function render(dt) {
      var intro = 1 - Math.pow(1 - clamp(cur.intro, 0, 1), 3);
      var p = cur.pan, wind = windAt(t);
      var heatBase = Math.min(1.3, cur.burn + charge * 0.9);
      var pulse = 0.75 + 0.25 * Math.sin(t * 2.2) + 0.08 * Math.sin(t * 5.3);

      /* --- where the climber is: along the path; steps come from ground travelled --- */
      var u = fixed ? 0 : pathU(p), P = fixed ? P0 : bez(u);
      var travelled = arcAt(u), phase = (travelled / STRIDE) * TAU;
      var grounded = fixed ? 1 : 1 - smooth(0.4, 0.52, p), flight = 1 - grounded;
      var sp = reduce ? 0 : speed * grounded, sn = Math.sin(phase);
      var dxw = P[0] - P0[0], dyw = P[1] - P0[1];
      var bob = -3 * sp * Math.abs(sn) + (reduce ? 0 : Math.sin(t * 1.6) * 0.5);

      /* --- camera: he stays put on screen, the mountain slides under him --- */
      var base = Math.max(W / IW, H / IH);
      var zoom = fixed ? 1.04 : 1 + 0.06 * smooth(0.7, 1, p);
      zoom *= 1 + (1 - intro) * 0.22 + (reduce ? 0 : Math.sin(t * 0.6) * 0.005) + charge * 0.04;
      var k = base * zoom, vw = W / k, vh = H / k;
      var tx, ty;
      if (fixed) { tx = 0.5 * IW; ty = opts.fixed * IH; }
      else { tx = P[0] - 0.12 * vw; ty = P[1] - 0.1 * vh; }
      var cxT = clamp(tx, vw / 2, Math.max(vw / 2, IWE - vw / 2)), cyT = clamp(ty, vh / 2, Math.max(vh / 2, IH - vh / 2));
      var follow = camX === null ? 1 : 1 - Math.exp(-dt * 9);          // light smoothing so the camera glides
      camX = camX === null ? cxT : camX + (cxT - camX) * follow;
      camY = camY === null ? cyT : camY + (cyT - camY) * follow;
      var sx = camX - vw / 2 - (sm.x - 0.5) * 14 / k, sy = camY - vh / 2 - (sm.y - 0.5) * 10 / k;
      var flick = reduce ? 1 : 0.95 + Math.sin(t * 7.3) * 0.015 + Math.sin(t * 2.1) * 0.025;
      var camU = intro * flick;

      /* --- wing physics: attached at the shoulders, spring-driven, following his motion --- */
      var shx = SHOULDER[0] + dxw, shy = SHOULDER[1] + dyw + bob;
      var r = phys.root;
      if (!r.init) { r.x = shx; r.y = shy; r.init = true; }
      var steps = Math.max(1, Math.ceil(dt / 0.008)), h = dt / steps;
      var T = 2.9 - 1.2 * flight, A = (reduce ? 0.2 : 1) * (0.05 + 0.055 * flight + 0.012 * speed + 0.01 * Math.min(1, heatBase));
      var wave = flapWave(t, T);
      for (var si = 0; si < steps; si++) {
        var ax = 90 * (shx - r.x) - 11 * r.vx, ay = 90 * (shy - r.y) - 11 * r.vy;
        r.vx += ax * h; r.vy += ay * h; r.x += r.vx * h; r.y += r.vy * h;
        var lag = clamp((r.y - shy) * 0.012 + r.vy * 0.0006, -0.12, 0.12);   // body drops, wings are thrown up
        var tgt = 0.02 + A * wave + lag + 0.05 * (wind - 0.5) + 0.05 * sp + 0.08 * flight;
        ['L', 'R'].forEach(function (s) {
          var w = phys[s]; w.w += (w.K * (tgt - w.a) - w.C * w.w) * h; w.a += w.w * h;
        });
      }
      phys.bend = clamp(0.55 + 0.25 * Math.abs(phys.L.w) * 0.6, 0.5, 0.8);
      var sc = fixed ? 1 : WING_SCALE;
      var mL = meta ? meta.wingL : null, mR = meta ? meta.wingR : null;
      if (mL) {
        var offL = fixed ? [mL.px, mL.py] : [r.x - 12, r.y - 3], offR = fixed ? [mR.px, mR.py] : [r.x + 8, r.y - 6];
        wingPose.L = { ang: phys.L.a, ax: offL[0], ay: offL[1], sc: sc };
        wingPose.R = { ang: -phys.R.a, ax: offR[0], ay: offR[1], sc: sc };
      }

      if (g) {
        var gl = g.gl, U = g.U;
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0.02, 0.02, 0.024, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.u_view, W, H);
        gl.uniform3f(U.u_cam, sx, sy, k);
        gl.uniform1f(U.u_t, t);
        gl.uniform1f(U.u_burn, heatBase * pulse);
        gl.uniform2f(U.u_res, cv.width, cv.height);

        drawLayer('base', { bend: 0 }, camU);
        if (!fixed) drawLayer('baseR', { bend: 0 }, camU);

        // wings sit behind him
        [[fixed ? 'wingLr' : 'wingL', wingPose.L], [fixed ? 'wingRr' : 'wingR', wingPose.R]].forEach(function (w) {
          var mt = meta[w[0]];
          drawLayer(w[0], { ang: w[1].ang, bend: phys.bend, sc: w[1].sc, tx: w[1].ax - mt.px, ty: w[1].ay - mt.py }, camU);
        });

        if (!fixed) {
          // legs step in opposite phase, then trail behind when he leaves the ground; bag sways, strap flutters
          var stepA = 0.15 * sp * sn, lift = 5 * sp;
          var lean = 0.025 * sp * sn + 0.012 * (wind - 0.5) - 0.1 * flight;
          var packA = 0.03 + wind * 0.05 * Math.sin(t * 2.4 + 0.5) + wind * 0.028 * Math.sin(t * 5.1) - 0.02 * sp * sn;
          var strapA = 0.4 * wind + 0.3 * wind * Math.sin(t * 8.5);
          drawLayer('cLegL', { ang: stepA + 0.22 * flight, bend: 0.2, tx: dxw, ty: dyw - lift * Math.max(0, sn) }, camU);
          drawLayer('cLegR', { ang: -stepA + 0.26 * flight, bend: 0.2, tx: dxw, ty: dyw - lift * Math.max(0, -sn) }, camU);
          drawLayer('cTorso', { ang: lean, bend: 0.3, tx: dxw, ty: dyw + bob }, camU);
          drawLayer('cPack', { ang: packA, bend: 0.6, tx: dxw, ty: dyw + bob, wy: 1, wamp: 2.4 * wind, wfreq: 0.09, wspeed: 7 }, camU);
          drawLayer('cStrap', { ang: strapA, bend: 0.5, tx: dxw, ty: dyw + bob, wy: 1, wamp: 5 * wind, wfreq: 0.22, wspeed: 11 }, camU);
        }
      }

      /* --- overlay (screen blended): flat fallback, glow, embers, snow, wind --- */
      fx.setTransform(DPR, 0, 0, DPR, 0, 0);
      fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1;
      if (!g) {
        fx.fillStyle = '#050506'; fx.fillRect(0, 0, W, H);
        fx.save(); fx.setTransform(DPR * k, 0, 0, DPR * k, -sx * k * DPR, -sy * k * DPR);
        fx.globalAlpha = intro; fx.drawImage(pots.base.im, 0, 0, IW, IH);
        if (!fixed) { var mb = meta.baseR; fx.drawImage(pots.baseR.im, mb.x, mb.y, mb.w, mb.h); }
        [fixed ? 'wingLr' : 'wingL', fixed ? 'wingRr' : 'wingR'].forEach(function (n, ni) { var mt = meta[n], wp = wingPose[ni ? 'R' : 'L']; fx.drawImage(pots[n].im, mt.x - mt.px + wp.ax, mt.y - mt.py + wp.ay, mt.w * wp.sc, mt.h * wp.sc); });
        if (!fixed) ['cLegL', 'cLegR', 'cTorso', 'cPack', 'cStrap'].forEach(function (n) { var mt = meta[n]; fx.drawImage(pots[n].im, mt.x + dxw, mt.y + dyw, mt.w, mt.h); });
        fx.restore();
      } else fx.clearRect(0, 0, W, H);

      var heat = cur.burn + charge;
      if (heat > 0.02) {   // soft halo around the wings
        var hx0 = fixed ? 0.52 * IW : r.x, hy0 = fixed ? 0.6 * IH : r.y - 60;
        var hrx = (hx0 - sx) * k, hry = (hy0 - sy) * k, hr = (fixed ? 330 : 230) * k;
        fx.globalCompositeOperation = 'lighter'; fx.globalAlpha = Math.min(0.4, heat * 0.2 * pulse) * intro;
        fx.drawImage(torch, hrx - hr, hry - hr, hr * 2, hr * 2);
      }
      if (heat > 0.02 && !reduce) spawn(Math.round((coarse ? 0.7 : 1.8) * heat + Math.random() * 0.6), 1 + charge);

      fx.save();
      fx.setTransform(DPR * k, 0, 0, DPR * k, -sx * k * DPR, -sy * k * DPR);
      fx.globalCompositeOperation = 'lighter';
      for (var i = parts.length - 1; i >= 0; i--) {
        var q = parts[i];
        q.x += q.vx + wind * 0.25 + Math.sin(t * 2 + q.ph) * 0.12; q.y += q.vy; q.life -= q.dec;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        fx.globalAlpha = q.life * 0.9 * intro;
        fx.fillStyle = q.life > 0.55 ? '#ffd9a0' : '#ff4a2a';
        fx.beginPath(); fx.arc(q.x, q.y, q.r, 0, TAU); fx.fill();
      }
      fx.restore();

      /* snow falls and drifts with the wind; near flakes are bigger, faster and brighter */
      var slow = reduce ? 0.25 : 1;
      fx.globalCompositeOperation = 'lighter';
      for (var si2 = 0; si2 < snow.length; si2++) {
        var f = snow[si2];
        f.y += (40 + 95 * f.z) * dt * slow;
        f.x += (wind * (70 + 150 * f.z) + Math.sin(t * 1.3 + f.ph) * 14) * dt * slow;
        if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
        if (f.x > W + 6) f.x = -6; else if (f.x < -6) f.x = W + 6;
        fx.globalAlpha = (0.45 + 0.5 * f.z) * intro;
        var fs = 5 + 16 * f.z * f.z;
        fx.drawImage(flake, f.x - fs / 2, f.y - fs / 2, fs, fs);
      }
      if (!reduce) {
        var gustAmt = clamp((wind - 0.55) / 0.6, 0, 1);
        for (var wi2 = 0; wi2 < streaks.length; wi2++) {
          var s = streaks[wi2];
          s.x += (380 + 900 * wind) * s.sp * dt; s.y += 40 * s.sp * dt;
          if (s.x - s.len > W) { s.x = -s.len * Math.random(); s.y = Math.random() * H; s.len = 120 + Math.random() * 240; s.sp = 0.6 + Math.random() * 0.8; }
          var al = (0.12 + 0.45 * gustAmt) * s.sp * intro;
          var gr = fx.createLinearGradient(s.x - s.len, 0, s.x, 0);
          gr.addColorStop(0, 'rgba(235,242,255,0)'); gr.addColorStop(1, 'rgba(235,242,255,' + al.toFixed(3) + ')');
          fx.globalAlpha = 1; fx.strokeStyle = gr; fx.lineWidth = 1.6;
          fx.beginPath(); fx.moveTo(s.x - s.len, s.y - s.len * 0.07); fx.lineTo(s.x, s.y); fx.stroke();
        }
      }

      /* marker follows the climber and fades once he is under way */
      var hint = (1 - smooth(0, 0.08, p)) * intro;
      if (!fixed && hint > 0.02) {
        var hx = (P[0] - sx) * k, hy = (P[1] + bob - sy) * k, rr = (46 + Math.sin(t * 3) * 5) * k * 0.7;
        fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = hint;
        fx.strokeStyle = '#c1121f'; fx.lineWidth = 2;
        fx.beginPath(); fx.arc(hx, hy, rr, 0, TAU); fx.stroke();
        fx.beginPath(); fx.moveTo(hx - rr, hy); fx.lineTo(hx - rr - 60, hy); fx.stroke();
        fx.font = '700 13px "Space Mono", monospace'; fx.textAlign = 'right';
        fx.lineWidth = 4; fx.strokeStyle = '#000'; fx.lineJoin = 'round';
        fx.strokeText('THIS IS HIM', hx - rr - 68, hy + 5);
        fx.fillStyle = '#fff'; fx.fillText('THIS IS HIM', hx - rr - 68, hy + 5);
      }

      if (opts.interact && pm.x >= 0) {
        var rc = cv.getBoundingClientRect(), mx = pm.x - rc.left, my = pm.y - rc.top;
        if (mx >= 0 && my >= 0 && mx <= W && my <= H) {
          var spd = pm.px < 0 ? 0 : Math.hypot(pm.x - pm.px, pm.y - pm.py);
          if (spd > 2 && !reduce) spawnAt(sx + mx / k, sy + my / k, Math.min(5, Math.round(spd / 10)), 1);
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
      if (!active || !ready) return;
      if (g && !g.tex) uploadTextures(g);
      t = now / 1000;
      var dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
      for (var key in target) cur[key] += (target[key] - cur[key]) * (1 - Math.exp(-dt * (key === 'intro' ? 2.6 : 6)));
      var fm = 1 - Math.exp(-dt * 4);
      sm.x += (mouse.x - sm.x) * fm; sm.y += (mouse.y - sm.y) * fm;
      charge = charging ? Math.min(1, charge + dt * 0.9) : Math.max(0, charge - dt * 2);
      var inst = dt > 0 ? Math.abs(cur.pan - prevPan) / dt : 0; prevPan = cur.pan;
      vel += (inst - vel) * (1 - Math.exp(-dt * 6));
      speed = clamp(vel * 7, 0, 1);
      render(dt);
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

  /* exported */
  export const Scene = { create: create };
