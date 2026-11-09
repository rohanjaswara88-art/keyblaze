/*
 * Liquid trail cursor.
 * The pointer paints a soft height field into a small 2D canvas (a "smear" that
 * fades over time). Two WebGL layers read it:
 *   - the background layer draws the landscape and refracts it through the
 *     smear with a little colour dispersion, so the streak looks like liquid glass;
 *   - a transparent overlay above the UI adds the glossy rim and highlights so
 *     the streak stays visible over panels and text.
 * The smear is warped by drifting noise in the shader, which makes it wobble
 * and flow like liquid as it fades.
 */
(function (root) {
  'use strict';

  const TRAIL_SCALE = 0.5;          // smear canvas resolution vs CSS px
  const FADE_PER_SEC = 1.9;         // how quickly the streak dissolves
  const RADIUS_SLOW = 13;           // streak half-width (CSS px) when moving slowly
  const RADIUS_FAST = 22;           // ... and when flicking fast
  const SPEED_FOR_FAST = 2200;      // px/s
  const HEAD_RADIUS = 9;            // the bead that sits under the cursor
  const HEAD_FOLLOW = 30;           // spring rate of the streak head
  const REFRACTION_PX = 30;
  const PARALLAX_PX = 14;
  const MAX_DPR = 1.25;
  const IDLE_FADE_MS = 1600;

  /* ---------- shared GLSL ---------- */

  const VS = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

  const COMMON = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTrail;
    uniform vec2 uTrailTexel;
    uniform float uTime;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    // Drifting warp makes the streak wobble and flow.
    float trail(vec2 uv) {
      vec2 q = uv * vec2(9.0, 6.0);
      vec2 w = vec2(noise(q + uTime * 0.7), noise(q + 17.0 - uTime * 0.6)) - 0.5;
      float h = texture2D(uTrail, uv + w * 0.012).r;
      return max(0.0, h - 0.06) / 0.94;
    }
    vec2 trailSlope(vec2 uv, out float h) {
      h = trail(uv);
      vec2 ox = vec2(uTrailTexel.x * 1.5, 0.0);
      vec2 oy = vec2(0.0, uTrailTexel.y * 1.5);
      return vec2(trail(uv + ox) - trail(uv - ox), trail(uv + oy) - trail(uv - oy));
    }
    float specular(vec2 slope, float k) {
      vec3 n = normalize(vec3(-slope * k, 1.0));
      vec3 L = normalize(vec3(-0.45, 0.6, 0.7));
      return pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 22.0);
    }`;

  const SCENE_FS = `${COMMON}
    uniform sampler2D uSky, uLand;
    uniform vec2 uRes, uParallax;
    uniform float uRefract;
    uniform vec3 uMist;
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }
    vec3 scene(vec2 uv) {
      vec3 col = texture2D(uSky, uv).rgb;
      vec2 sp = uv * uRes / 46.0;
      vec2 cell = floor(sp);
      float r = hash(cell);
      vec2 pos = vec2(hash(cell + 1.7), hash(cell + 9.3));
      float d = length(fract(sp) - pos) * 46.0;
      float size = mix(0.6, 1.6, pow(hash(cell + 3.1), 3.0));
      float twinkle = 0.55 + 0.45 * sin(uTime * (0.5 + r * 1.8) + r * 50.0);
      col += smoothstep(size, 0.0, d) * step(0.62, r) * twinkle * smoothstep(0.38, 0.75, uv.y) * 0.95;
      vec4 land = texture2D(uLand, uv + uParallax);
      return mix(col, land.rgb, land.a);
    }
    void main() {
      float h;
      vec2 slope = trailSlope(vUv, h);
      vec2 off = slope * uRefract;
      vec3 col;
      if (h > 0.001) {
        // Slight dispersion: each channel bends a little differently.
        col = vec3(scene(vUv + off).r, scene(vUv + off * 1.14).g, scene(vUv + off * 1.3).b);
      } else {
        col = scene(vUv);
      }
      float band = smoothstep(0.05, 0.26, vUv.y) * smoothstep(0.52, 0.28, vUv.y);
      float fog = fbm(vec2(vUv.x * 2.6 + uTime * 0.012, vUv.y * 7.0 - uTime * 0.004));
      col = mix(col, uMist, band * fog * 0.32);
      float body = smoothstep(0.02, 0.3, h);
      col = mix(col, col * 1.08 + 0.02, body * 0.6);
      col += specular(slope, 7.0) * body * 0.4;
      gl_FragColor = vec4(col, 1.0);
    }`;

  const GLASS_FS = `${COMMON}
    void main() {
      float h;
      vec2 slope = trailSlope(vUv, h);
      float body = smoothstep(0.02, 0.3, h);
      float rim = clamp(length(slope) * 7.0, 0.0, 1.0) * body;
      float spec = specular(slope, 7.0) * body;
      float a = clamp(body * 0.035 + rim * 0.22 + spec * 0.7, 0.0, 0.85);
      vec3 tint = mix(vec3(0.86, 0.9, 1.0), vec3(1.0), spec);
      gl_FragColor = vec4(tint * a, a);
    }`;

  /* ---------- GL helpers ---------- */

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function createLayer(canvas, fragment, uniformNames, contextOptions) {
    const gl = canvas.getContext('webgl', contextOptions);
    if (!gl) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const u = {};
    ['uTrail', 'uTrailTexel', 'uTime', ...uniformNames].forEach((name) => { u[name] = gl.getUniformLocation(prog, name); });
    const textures = {};
    return {
      gl, u, canvas,
      texture(name, unit) {
        if (!textures[name]) {
          const tex = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.uniform1i(u[name], unit);
          textures[name] = tex;
        }
        return textures[name];
      },
      upload(name, unit, source) {
        const tex = this.texture(name, unit);
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      },
    };
  }

  function hexToRgb(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec((hex || '').trim());
    return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.8, 0.83, 0.88];
  }

  /** Soft dome used to paint the height field. */
  function makeSprite() {
    const s = document.createElement('canvas');
    s.width = 128;
    s.height = 128;
    const c = s.getContext('2d');
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgb(255,255,255)');
    g.addColorStop(0.35, 'rgb(236,236,236)');
    g.addColorStop(0.65, 'rgb(150,150,150)');
    g.addColorStop(0.85, 'rgb(50,50,50)');
    g.addColorStop(1, 'rgb(0,0,0)');
    c.fillStyle = '#000';
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return s;
  }

  /* ---------- the effect ---------- */

  function createTrail(sceneCanvas, glassCanvas, options) {
    // paint: false keeps only the landscape renderer (another cursor effect owns the mouse).
    const paint = !options || options.paint !== false;
    const scene = createLayer(sceneCanvas, SCENE_FS, ['uSky', 'uLand', 'uRes', 'uParallax', 'uRefract', 'uMist'],
      { alpha: false, antialias: false });
    if (!scene) return null;
    const glass = glassCanvas
      ? createLayer(glassCanvas, GLASS_FS, [], { alpha: true, premultipliedAlpha: true, antialias: false })
      : null;

    const smear = document.createElement('canvas');
    const sctx = smear.getContext('2d');
    const sprite = makeSprite();

    let cssW = 0;
    let cssH = 0;
    let ready = false;
    let quiet = false;
    let enabled = true; // off while a theme without the landscape is active
    let raf = null;
    let lastT = 0;
    let lastPaint = -Infinity;
    let frameCount = 0;
    const start = performance.now();
    const pointer = { x: 0, y: 0, inside: false, speed: 0, lastMove: 0 };
    const head = { x: 0, y: 0, placed: false };
    const parallax = { x: 0, y: 0, tx: 0, ty: 0 };

    function stamp(x, y, r) {
      const s = r * TRAIL_SCALE;
      sctx.drawImage(sprite, x * TRAIL_SCALE - s, y * TRAIL_SCALE - s, s * 2, s * 2);
    }

    /** Paints a tapered liquid stroke between two points. */
    function paintSegment(x0, y0, x1, y1, r0, r1) {
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(dist / (Math.min(r0, r1) * 0.3)));
      sctx.globalCompositeOperation = 'lighten';
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        stamp(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r0 + (r1 - r0) * t);
      }
      lastPaint = performance.now();
    }

    function fade(dt) {
      sctx.globalCompositeOperation = 'source-over';
      sctx.fillStyle = `rgba(0,0,0,${(1 - Math.exp(-FADE_PER_SEC * dt)).toFixed(4)})`;
      sctx.fillRect(0, 0, smear.width, smear.height);
    }

    async function rebuildScene() {
      try {
        const art = await root.TT.scene.rasterize(Math.round(cssW), Math.round(cssH));
        scene.gl.useProgram(scene.gl.getParameter(scene.gl.CURRENT_PROGRAM));
        scene.upload('uSky', 1, art.sky);
        scene.upload('uLand', 2, art.land);
        scene.gl.uniform3fv(scene.u.uMist, hexToRgb(getComputedStyle(document.documentElement).getPropertyValue('--mist')));
        ready = true;
        document.getElementById('scene').classList.add('gl-scene');
        wake();
      } catch (err) {
        console.warn('Liquid trail scene unavailable, keeping the static landscape:', err);
      }
    }

    function sizeCanvas(layer) {
      const dpr = Math.min(MAX_DPR, root.devicePixelRatio || 1);
      layer.canvas.width = Math.round(cssW * dpr);
      layer.canvas.height = Math.round(cssH * dpr);
      layer.gl.viewport(0, 0, layer.canvas.width, layer.canvas.height);
    }

    function resize() {
      cssW = root.innerWidth;
      cssH = root.innerHeight;
      sizeCanvas(scene);
      if (glass) sizeCanvas(glass);
      smear.width = Math.max(2, Math.round(cssW * TRAIL_SCALE));
      smear.height = Math.max(2, Math.round(cssH * TRAIL_SCALE));
      sctx.fillStyle = '#000';
      sctx.fillRect(0, 0, smear.width, smear.height);
      rebuildScene();
    }

    function updateHead(dt) {
      if (!paint || !pointer.inside || quiet) return;
      if (!head.placed) {
        head.x = pointer.x;
        head.y = pointer.y;
        head.placed = true;
      }
      const k = 1 - Math.exp(-HEAD_FOLLOW * dt);
      const nx = head.x + (pointer.x - head.x) * k;
      const ny = head.y + (pointer.y - head.y) * k;
      const moving = Math.hypot(nx - head.x, ny - head.y) > 0.3;
      const fast = Math.min(1, pointer.speed / SPEED_FOR_FAST);
      const r = RADIUS_SLOW + (RADIUS_FAST - RADIUS_SLOW) * fast;
      if (moving) paintSegment(head.x, head.y, nx, ny, r, r);
      head.x = nx;
      head.y = ny;
      // A small bead stays under the cursor while it is on the page.
      if (performance.now() - pointer.lastMove < IDLE_FADE_MS) {
        sctx.globalCompositeOperation = 'lighten';
        stamp(head.x, head.y, HEAD_RADIUS);
        lastPaint = performance.now();
      }
      pointer.speed *= Math.exp(-6 * dt);
    }

    function drawLayer(layer, now, extra) {
      const { gl, u } = layer;
      layer.upload('uTrail', 0, smear);
      gl.uniform2f(u.uTrailTexel, 1 / smear.width, 1 / smear.height);
      gl.uniform1f(u.uTime, (now - start) / 1000);
      if (extra) extra(gl, u);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      if (!enabled) {
        raf = 0;
        return;
      }
      raf = root.requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
      lastT = now;
      updateHead(dt);
      fade(dt);
      const trailLive = now - lastPaint < 2500;
      frameCount += 1;
      // When nothing is moving, stars and fog only need ~30fps.
      if (!trailLive && frameCount % 2 === 1) return;
      parallax.x += (parallax.tx - parallax.x) * 0.05;
      parallax.y += (parallax.ty - parallax.y) * 0.05;
      if (ready) {
        drawLayer(scene, now, (gl, u) => {
          gl.uniform2f(u.uRes, cssW, cssH);
          gl.uniform2f(u.uParallax, (parallax.x * PARALLAX_PX) / cssW, (-parallax.y * PARALLAX_PX) / cssH);
          gl.uniform1f(u.uRefract, (REFRACTION_PX / cssW) * 4);
        });
      }
      if (glass && (trailLive || frameCount % 30 === 0)) drawLayer(glass, now);
    }

    function wake() {
      if (!raf) raf = root.requestAnimationFrame(frame);
    }

    function onMove(e) {
      const now = performance.now();
      parallax.tx = (e.clientX / cssW - 0.5) * -1;
      parallax.ty = (e.clientY / cssH - 0.5) * -1;
      if (pointer.inside) {
        const dt = Math.max(8, now - pointer.lastMove) / 1000;
        const inst = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) / dt;
        pointer.speed = Math.max(pointer.speed * 0.7, inst);
      }
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
      pointer.lastMove = now;
    }

    /** A burst of liquid at a point (clicks, celebrations). */
    function splash(x, y, power) {
      if (!paint) return;
      const p = power || 1;
      sctx.globalCompositeOperation = 'lighten';
      stamp(x, y, 26 * p);
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + Math.random() * 0.5;
        const len = (30 + Math.random() * 40) * p;
        paintSegment(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 9 * p, 3 * p);
      }
    }

    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerdown', (e) => { if (!quiet) splash(e.clientX, e.clientY, 0.7); }, { passive: true });
    document.addEventListener('pointerleave', () => { pointer.inside = false; head.placed = false; });
    root.addEventListener('blur', () => { pointer.inside = false; head.placed = false; });
    let resizeTimer = null;
    root.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });
    resize();
    wake();

    return {
      splash,
      /** While typing, the pointer stops painting the trail. */
      setQuiet(value) {
        quiet = Boolean(value);
        head.placed = false;
      },
      refreshTheme() { rebuildScene(); },
      /** Stops or restarts drawing the landscape. */
      setEnabled(value) {
        enabled = Boolean(value);
        if (enabled) wake();
      },
    };
  }

  const noop = { splash() {}, setQuiet() {}, refreshTheme() {}, setEnabled() {} };

  function init(sceneCanvas, glassCanvas, options) {
    if (!sceneCanvas || root.matchMedia('(prefers-reduced-motion: reduce)').matches) return noop;
    try {
      return createTrail(sceneCanvas, glassCanvas, options) || noop;
    } catch (err) {
      console.warn('Liquid trail disabled:', err);
      return noop;
    }
  }

  root.TT = Object.assign(root.TT || {}, { trail: { init } });
})(typeof window !== 'undefined' ? window : globalThis);
