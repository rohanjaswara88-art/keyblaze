/* SOLO — "The Ascent": layered animation of one picture.
   The artwork was cut into layers: the background (repainted behind the wings),
   a left wing and a right wing. Each wing is a real piece that beats around its root.
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

  var RATE = 3.4;        // climber gait speed
  var IW = 736, IH = 1308;  // logical size of the picture
  var WING_REACH = 260;  // how far a feather tip is from the root (logical px)

  /* ---------- assets ---------- */
  var ready = false, embers = [], meta = null;
  var pots = {};         // power-of-two canvases for the GPU: base, wingL, wingR

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('load ' + src)); }; im.src = src;
    });
  }
  function pot(n) { var p = 1; while (p < n) p <<= 1; return p; }
  function toPot(im) {
    var c = document.createElement('canvas');
    c.width = pot(im.naturalWidth); c.height = pot(im.naturalHeight);
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(im, 0, 0);
    return { cv: c, ts: [im.naturalWidth / c.width, im.naturalHeight / c.height], im: im };
  }

  Promise.all([
    loadImage('media/ascent.jpg'),
    loadImage('media/base-hd.jpg'),
    loadImage('media/wingL.png'),
    loadImage('media/wingR.png'),
    fetch('media/layers.json').then(function (r) { return r.json(); })
  ]).then(function (r) {
    var small = r[0];
    meta = r[4];
    // base is drawn into a 2048x4096 canvas (stretched slightly) so it can be mipmapped
    var bc = document.createElement('canvas'); bc.width = 2048; bc.height = 4096;
    var bx = bc.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(r[1], 0, 0, 2048, 4096);
    pots.base = { cv: bc, ts: [1, 1], im: r[1] };
    pots.wingL = toPot(r[2]);
    pots.wingR = toPot(r[3]);

    // where the fire is: used to place embers
    try {
      var c = document.createElement('canvas'); c.width = IW; c.height = IH;
      var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(small, 0, 0);
      var d = x.getImageData(0, 0, IW, IH).data, gw = IW >> 1, gh = IH >> 1;
      for (var y = 0; y < gh; y++) for (var xx = 0; xx < gw; xx++) {
        var lum = d[((y * 2) * IW + xx * 2) * 4], nx = xx / gw, ny = y / gh;
        var dx = (nx - 0.52) / 0.38, dy = (ny - 0.6) / 0.27, reg = Math.max(0, 1 - (dx * dx + dy * dy));
        var a = lum > 175 ? ((lum - 175) / 80) * Math.pow(reg, 0.55) : 0;
        if (a > 0.5 && Math.random() < 0.03) embers.push([nx, ny]);
      }
    } catch (e) { /* file:// blocks pixel reads */ }
    if (!embers.length) embers.push([0.5, 0.6]);
    ready = true;
  }).catch(function (e) { if (window.console) console.warn('SOLO: could not load artwork layers', e); });

  /* ---------- wing beat: slow lift, fast downstroke ---------- */
  function flapWave(t, period) {
    var u = (t / period) % 1;
    if (u < 0.62) return -1 + 2 * easeIO(u / 0.62);
    var x = (u - 0.62) / 0.38;
    return 1 - 2 * (x * x * (3 - 2 * x));
  }
  function wingAngle(t, heat) {
    var A = (reduce ? 0.2 : 1) * (0.05 + 0.13 * heat);
    return 0.02 + A * flapWave(t, 1.9 - 0.75 * heat);
  }

  // same maths as the shader: where a point of the picture is right now
  function rotAbout(px, py, pvx, pvy, ang) {
    var dx = px - pvx, dy = py - pvy, s = clamp(Math.hypot(dx, dy) / WING_REACH, 0, 1);
    var a = ang * (0.35 + 0.65 * s), c = Math.cos(a), sn = Math.sin(a);
    return [pvx + dx * c - dy * sn, pvy + dx * sn + dy * c];
  }
  function warp(u, v, st) {
    var x = u * IW, y = v * IH, r;
    if (meta && y < 0.57 * IH + (x - 0.516 * IW) * -0.1 && x >= 0.516 * IW) { r = rotAbout(x, y, meta.wingR.px, meta.wingR.py, -st.wing); x = r[0]; y = r[1]; }
    else if (meta && x < 0.516 * IW && y < 0.61 * IH) { r = rotAbout(x, y, meta.wingL.px, meta.wingL.py, st.wing); x = r[0]; y = r[1]; }
    var mc = 1 - smooth(0, 1, Math.hypot((u - 0.80) / 0.15, (v - 0.85) / 0.11));
    var ph = st.t * RATE, up = clamp((0.92 - v) / 0.12, 0, 1);
    y += -Math.sin(ph * 2) * 6 * st.gait * mc * (0.4 + 0.6 * up);
    x += Math.sin(ph) * 10 * st.gait * mc * (1 - up);
    var qx = 0.77 * IW, qy = 0.925 * IH, a2 = 0.05 * Math.sin(ph) * st.gait * mc;
    var rx = x - qx, ry = y - qy, c = Math.cos(a2), s = Math.sin(a2);
    return [qx + rx * c - ry * s, qy + rx * s + ry * c];
  }

  /* ---------- shaders ---------- */
  var VS = [
    'attribute vec2 a_uv;',
    'uniform vec4 u_rect; uniform vec2 u_view; uniform vec3 u_cam;',
    'uniform float u_t; uniform float u_mode; uniform float u_ang; uniform float u_reach;',
    'uniform float u_gait; uniform float u_rate; uniform vec2 u_pivot;',
    'varying vec2 v_uv; varying vec2 v_p;',
    'void main(){',
    '  v_uv = a_uv;',
    '  vec2 p = u_rect.xy + a_uv * u_rect.zw;',
    '  v_p = p;',
    '  if (u_mode > 0.5) {',
    '    vec2 d = p - u_pivot;',
    '    float s = clamp(length(d) / u_reach, 0.0, 1.0);',
    '    float a = u_ang * (0.35 + 0.65 * s);',
    '    p = u_pivot + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));',
    '  } else {',
    '    vec2 uv = a_uv;',
    '    float mc = 1.0 - smoothstep(0.0, 1.0, length((uv - vec2(0.80, 0.85)) / vec2(0.15, 0.11)));',
    '    float ph = u_t * u_rate;',
    '    float up = clamp((0.92 - uv.y) / 0.12, 0.0, 1.0);',
    '    p.y += -sin(ph * 2.0) * 6.0 * u_gait * mc * (0.4 + 0.6 * up);',
    '    p.x += sin(ph) * 10.0 * u_gait * mc * (1.0 - up);',
    '    vec2 q = vec2(0.77 * 736.0, 0.925 * 1308.0);',
    '    float a2 = 0.05 * sin(ph) * u_gait * mc;',
    '    vec2 r = p - q;',
    '    p = q + vec2(r.x * cos(a2) - r.y * sin(a2), r.x * sin(a2) + r.y * cos(a2));',
    '  }',
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
    'uniform sampler2D u_tex; uniform vec2 u_ts; uniform vec4 u_rect;',
    'uniform float u_t; uniform float u_burn; uniform float u_alpha; uniform float u_ga; uniform vec2 u_res;',
    'void main(){',
    '  vec2 ip = v_p / vec2(736.0, 1308.0);',
    '  vec2 dw = (ip - vec2(0.52, 0.6)) / vec2(0.38, 0.27);',
    '  float m = pow(max(0.0, 1.0 - dot(dw, dw)), 0.55);',
    '  vec2 sh = u_burn * m * 1.2 * vec2(sin(v_p.y * 0.3 + u_t * 3.1), cos(v_p.x * 0.25 + u_t * 2.7)) / u_rect.zw;',
    '  vec2 uv = (v_uv + sh) * u_ts;',
    '  vec4 tx = texture2D(u_tex, uv);',
    '  float a = tx.a;',
    '  float lum = tx.r / max(a, 0.001);',
    '  float core = smoothstep(0.69, 1.0, lum) * m * a;',
    '  vec3 c = tx.rgb * mix(vec3(1.0), vec3(1.0, 0.84, 0.72), clamp(m * u_burn * 0.5, 0.0, 1.0));',
    '  c += vec3(1.0, 0.45, 0.2) * core * u_burn * 0.22;',
    '  c = mix(c, vec3(1.0, 0.92, 0.8) * a, core * u_burn * 0.2);',
    '  vec2 q = gl_FragCoord.xy / u_res;',
    '  float vg = smoothstep(0.3, 0.95, length((q - vec2(0.5, 0.45)) * vec2(1.0, 0.95))) * 0.8;',
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
      ['u_rect', 'u_view', 'u_cam', 'u_t', 'u_mode', 'u_ang', 'u_reach', 'u_gait', 'u_rate', 'u_pivot', 'u_tex', 'u_ts',
        'u_burn', 'u_alpha', 'u_ga', 'u_res'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      return {
        gl: gl, U: U, loc: gl.getAttribLocation(pr, 'a_uv'), tex: null,
        meshBase: mesh(gl, coarse ? 36 : 56, coarse ? 64 : 100),
        meshWing: mesh(gl, 28, 28)
      };
    } catch (e) {
      if (window.console) console.warn('SOLO: WebGL unavailable, showing the flat picture.', e);
      return null;
    }
  }

  function uploadTextures(g) {
    var gl = g.gl, ext = gl.getExtension('EXT_texture_filter_anisotropic');
    g.tex = {};
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    ['base', 'wingL', 'wingR'].forEach(function (name) {
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

    var fxc = document.createElement('canvas');
    fxc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;mix-blend-mode:screen;display:block';
    cv.parentNode.insertBefore(fxc, cv.nextSibling);
    var fx = fxc.getContext('2d');

    var g = makeGL(cv);
    if (!g) fxc.style.mixBlendMode = 'normal';

    var W = 1, H = 1, DPR = 1, t = 0, lastT = 0, flash = 0, active = true, parts = [];
    var sm = { x: 0.5, y: 0.5 };
    var charge = 0, charging = false, vel = 0, prevPan = cur.pan, slowT = 0, slowN = 0;
    var pm = { x: -1, y: -1, px: -1, py: -1 };
    var dprCap = Math.min(devicePixelRatio || 1, 1.75);
    var st = { t: 0, wing: 0, gait: 1 };

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
          x: p[0], y: p[1], vx: (Math.random() - 0.5) * 0.5 * power, vy: -(0.35 + Math.random() * 1.1) * power,
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
        charging = false; shock(Math.max(0.35, charge)); charge = 0;
      };
      addEventListener('pointerup', release);
      addEventListener('pointercancel', release);
    }

    function drawLayer(mode, name, rect, ang, alphaMul, camU) {
      var gl = g.gl, U = g.U, m = mode ? g.meshWing : g.meshBase, p = pots[name];
      gl.bindTexture(gl.TEXTURE_2D, g.tex[name]);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
      gl.enableVertexAttribArray(g.loc); gl.vertexAttribPointer(g.loc, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
      gl.uniform4f(U.u_rect, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform2f(U.u_ts, p.ts[0], p.ts[1]);
      gl.uniform1f(U.u_mode, mode);
      gl.uniform1f(U.u_ang, ang);
      gl.uniform1f(U.u_alpha, camU);
      gl.uniform1f(U.u_ga, alphaMul);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }

    function render() {
      var intro = 1 - Math.pow(1 - clamp(cur.intro, 0, 1), 3);
      var p = cur.pan, fixed = opts.fixed;

      var base = Math.max(W / IW, H / IH);
      var zoom = fixed ? 1.04 : 1 + 0.1 * smooth(0.75, 1, p);
      zoom *= 1 + (1 - intro) * 0.22 + (reduce ? 0 : Math.sin(t * 0.6) * 0.006) + charge * 0.05;
      var k = base * zoom, vw = W / k, vh = H / k;
      var fyStart = 0.835 - 0.22 * (vh / IH);
      var fy = fixed ? fixed : fyStart + (0.56 - fyStart) * easeIO(clamp(p / 0.8, 0, 1)) - 0.05 * smooth(0.8, 1, p);
      var fx0 = fixed ? 0.5 : 0.5 + 0.3 * (1 - smooth(0, 0.4, p));
      var cx = clamp(fx0 * IW, Math.min(vw / 2, IW / 2), Math.max(IW - vw / 2, IW / 2));
      var cy = clamp(fy * IH, Math.min(vh / 2, IH / 2), Math.max(IH - vh / 2, IH / 2));
      var sx = cx - vw / 2 - (sm.x - 0.5) * 18 / k;
      var sy = cy - vh / 2 - (sm.y - 0.5) * 12 / k;

      var heatBase = Math.min(1.3, cur.burn + charge * 0.9);
      var pulse = 0.75 + 0.25 * Math.sin(t * 2.2) + 0.08 * Math.sin(t * 5.3);
      st.t = t;
      st.wing = wingAngle(t, heatBase);
      st.gait = reduce ? 0.3 : 1 + Math.min(2, vel * 7);
      var flick = reduce ? 1 : 0.94 + Math.sin(t * 7.3) * 0.02 + Math.sin(t * 2.1) * 0.03;
      var camU = intro * flick;

      if (g) {
        var gl = g.gl, U = g.U;
        gl.viewport(0, 0, cv.width, cv.height);
        gl.clearColor(0.02, 0.02, 0.024, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(U.u_view, W, H);
        gl.uniform3f(U.u_cam, sx, sy, k);
        gl.uniform1f(U.u_t, t);
        gl.uniform1f(U.u_gait, st.gait);
        gl.uniform1f(U.u_rate, RATE);
        gl.uniform1f(U.u_reach, WING_REACH);
        gl.uniform1f(U.u_burn, heatBase * pulse);
        gl.uniform2f(U.u_res, cv.width, cv.height);

        gl.uniform2f(U.u_pivot, 0, 0);
        drawLayer(0, 'base', [0, 0, IW, IH], 0, 1, camU);

        var wings = [['wingL', 1], ['wingR', -1]];
        // motion trails first (older, fainter), then the wings themselves
        for (var gi = 2; gi >= 0; gi--) {
          var ang = wingAngle(t - gi * 0.045, heatBase), am = gi === 0 ? 1 : (gi === 1 ? 0.22 : 0.1);
          if (gi > 0 && reduce) continue;
          for (var wi = 0; wi < 2; wi++) {
            var nm = wings[wi][0], mt = meta[nm];
            gl.uniform2f(U.u_pivot, mt.px, mt.py);
            drawLayer(1, nm, [mt.x, mt.y, mt.w, mt.h], ang * wings[wi][1], am, camU);
          }
        }
      }

      /* overlay: embers, marker, torch, flash */
      fx.setTransform(DPR, 0, 0, DPR, 0, 0);
      fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = 1;
      if (!g) {
        fx.fillStyle = '#050506'; fx.fillRect(0, 0, W, H);
        fx.save(); fx.setTransform(DPR * k, 0, 0, DPR * k, -sx * k * DPR, -sy * k * DPR);
        fx.globalAlpha = intro; fx.drawImage(pots.base.im, 0, 0, IW, IH);
        ['wingL', 'wingR'].forEach(function (n) { var mt = meta[n]; fx.drawImage(pots[n].im, mt.x, mt.y, mt.w, mt.h); });
        fx.restore();
      } else fx.clearRect(0, 0, W, H);

      var heat = cur.burn + charge;
      if (heat > 0.02) {
        var hc = warp(0.52, 0.6, st), hrx = (hc[0] - sx) * k, hry = (hc[1] - sy) * k, hr = 330 * k;
        fx.globalCompositeOperation = 'lighter'; fx.globalAlpha = Math.min(0.4, heat * 0.2 * pulse) * intro;
        fx.drawImage(torch, hrx - hr, hry - hr, hr * 2, hr * 2);
      }
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

      var hint = (1 - smooth(0, 0.1, p)) * intro;
      if (!fixed && hint > 0.02) {
        var hp = warp(0.8, 0.835, st);
        var hx = (hp[0] - sx) * k, hy = (hp[1] - sy) * k, r = (46 + Math.sin(t * 3) * 5) * k * 0.7;
        fx.globalCompositeOperation = 'source-over'; fx.globalAlpha = hint;
        fx.strokeStyle = '#c1121f'; fx.lineWidth = 2;
        fx.beginPath(); fx.arc(hx, hy, r, 0, TAU); fx.stroke();
        fx.beginPath(); fx.moveTo(hx - r, hy); fx.lineTo(hx - r - 60, hy); fx.stroke();
        fx.font = '700 13px "Space Mono", monospace'; fx.textAlign = 'right';
        fx.lineWidth = 4; fx.strokeStyle = '#000'; fx.lineJoin = 'round';
        fx.strokeText('THIS IS HIM', hx - r - 68, hy + 5);
        fx.fillStyle = '#fff'; fx.fillText('THIS IS HIM', hx - r - 68, hy + 5);
      }

      if (opts.interact && pm.x >= 0) {
        var rc = cv.getBoundingClientRect(), mx = pm.x - rc.left, my = pm.y - rc.top;
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
      if (!active || !ready) return;
      if (g && !g.tex) uploadTextures(g);
      t = now / 1000;
      var dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
      for (var key in target) cur[key] += (target[key] - cur[key]) * (1 - Math.exp(-dt * (key === 'intro' ? 2.6 : 5.5)));
      var fm = 1 - Math.exp(-dt * 4);
      sm.x += (mouse.x - sm.x) * fm; sm.y += (mouse.y - sm.y) * fm;
      charge = charging ? Math.min(1, charge + dt * 0.9) : Math.max(0, charge - dt * 2);
      var inst = dt > 0 ? Math.abs(cur.pan - prevPan) / dt : 0; prevPan = cur.pan;
      vel += (inst - vel) * (1 - Math.exp(-dt * 6));
      render();
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
