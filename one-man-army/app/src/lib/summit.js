/* SOLO — "The Summit": a generative halftone mountain, drawn entirely by a shader. No images.
   Scroll is altitude: the mountains slide down and away while a single ember climbs the slope;
   after the climb it lifts into a burning star. Snow falls, wind streaks cross the screen. */

const TAU = Math.PI * 2;
const coarse = () => matchMedia('(pointer: coarse)').matches;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const mouse = { x: 0.5, y: 0.5 };
if (typeof window !== 'undefined') {
  addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth; mouse.y = e.clientY / innerHeight; }, { passive: true });
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const windAt = (t) => {
  const gust = Math.pow(Math.max(0, Math.sin(t * 0.23 + 1.3)), 3) * 0.55;
  return clamp(0.5 + 0.22 * Math.sin(t * 0.7) + 0.18 * Math.sin(t * 1.9 + 1) + gust, 0.15, 1.25);
};

const VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

const FS = `
precision highp float;
uniform vec2 u_res;
uniform float u_t, u_p, u_burn, u_intro, u_flash, u_charge, u_speed, u_wind, u_ringR, u_ringA, u_fixed;
uniform vec2 u_mouse;

float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash21(i), hash21(i + vec2(1., 0.)), f.x), mix(hash21(i + vec2(0., 1.)), hash21(i + vec2(1., 1.)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0., a = .5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 3.7); a *= .5; }
  return v;
}

/* the three distant ranges slide down and drift left as you climb */
float ridgeFar(float x, float i, float alt){
  float freq = 1.25 + i * .65, amp = .36 - i * .05, base = .02 - i * .26;
  float shift = .10 + .30 * i;
  float n = fbm(vec2(x * freq + alt * (.18 + .32 * i) + i * 9.1, i * 3.7));
  return base - alt * shift + amp * (n - .45);
}
/* the slope he climbs: it only scrolls sideways, so he can stay put */
float ridgeGround(float x, float alt){
  return -.74 + .30 * x + .20 * (fbm(vec2(x * 3.1 + alt * 1.9, 11.3)) - .45);
}

void mount(inout float L, inout float R, vec2 uv, float i, float alt, float tone){
  float dd = ridgeFar(uv.x, i, alt) - uv.y;
  if (dd > 0.) {
    float cap = .09 + .02 * i;
    float snow = (1. - smoothstep(0., cap, dd)) * (.45 + .55 * noise(vec2(uv.x * 9. + i * 5., uv.y * 9.)));
    float strata = .06 * noise(vec2(uv.x * 14., uv.y * 22. + i));
    L = tone + .6 * snow + strata;
    R *= .35;
  }
  L += smoothstep(.012, 0., abs(dd)) * (.5 - i * .1);
}

float snowLayer(vec2 uv, float t, float scale, float speed, float seed){
  vec2 p = uv * scale;
  p.x += t * u_wind * speed * .6 + p.y * .15;
  p.y += t * speed;
  vec2 id = floor(p), f = fract(p) - .5;
  float h = hash21(id + seed);
  f.x += (h - .5) * .7 + sin(t * 1.7 + h * 6.28) * .08;
  f.y += (fract(h * 7.13) - .5) * .7;
  float r = .05 + .10 * fract(h * 3.7);
  return smoothstep(r, r * .35, length(f)) * step(.35, fract(h * 5.3));
}

void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = (fc * 2. - u_res) / u_res.y;
  float aspect = u_res.x / u_res.y;
  float alt = u_p * 4.2;
  float L = .035 + .09 * (1. - smoothstep(-.3, 1., uv.y));
  float R = 0.;

  /* distant stars */
  L += step(.9972, hash21(floor(fc / 3.))) * .9 * smoothstep(-.1, .5, uv.y);

  /* the star he is climbing toward */
  vec2 S = vec2(.10 * min(aspect, 1.6), .58);
  vec2 q = uv - S;
  float d = length(q);
  float burn = clamp(u_burn, 0., 1.3);
  float rs = .10 + .16 * burn + .05 * u_charge;
  L += exp(-d * 2.2) * (.16 + .8 * burn + .5 * u_charge);
  R += exp(-d * 1.6) * (.18 + .7 * burn);
  L += pow(abs(sin(atan(q.y, q.x) * 11. + u_t * .25)), 12.) * exp(-d * 2.) * (.22 + .9 * burn);
  L += smoothstep(rs, rs - .012, d) * 1.5;

  /* ranges, far to near, then the slope */
  mount(L, R, uv, 0., alt, .20);
  mount(L, R, uv, 1., alt, .13);
  mount(L, R, uv, 2., alt, .075);
  float gdd = ridgeGround(uv.x, alt) - uv.y;
  if (gdd > 0.) {
    L = .03 + .5 * (1. - smoothstep(0., .035, gdd)) + .05 * noise(uv * vec2(18., 10.) + vec2(alt * 4., 0.));
    R *= .2;
  }
  L += smoothstep(.01, 0., abs(gdd)) * .6;

  /* the ember: climbs the slope, then lifts into the star */
  float flight = clamp(mix(smoothstep(.42, .9, u_p), 1., u_fixed), 0., 1.);
  float x0 = -.12 * min(aspect, 1.4);
  float gy = ridgeGround(x0, alt);
  float bob = sin(alt * 70.) * .007 * u_speed + .003 * sin(u_t * 3.);
  vec2 E = vec2(mix(x0, S.x, flight * .85), mix(gy + .05 + bob, S.y - .2, flight));
  vec2 eq = uv - E;
  vec2 tdir = normalize(mix(vec2(-.94, -.34), vec2(0., -1.), flight));
  float along = dot(eq, tdir), perp = dot(eq, vec2(-tdir.y, tdir.x));
  float tail = step(0., along) * exp(-along * 4.5) * exp(-pow(perp / (.008 + .03 * along), 2.));
  float fl = .6 + .4 * noise(vec2(along * 25. - u_t * 9., perp * 30.));
  R += tail * fl * 1.6;
  L += tail * fl * .5 * exp(-along * 9.);
  float e2 = dot(eq, eq);
  L += exp(-e2 * 5500.) * 2.;
  R += exp(-e2 * 600.) * 1.2;

  /* sparks rising off the star while it burns */
  vec2 sp = (uv - S) * 14.;
  sp.y -= u_t * 2.2; sp.x += sin(u_t + sp.y) * .3;
  vec2 sid = floor(sp), sf = fract(sp) - .5;
  float sh = hash21(sid);
  R += smoothstep(.12, .0, length(sf + (sh - .5) * .5)) * step(.78, sh) * burn * exp(-d * 1.4);

  /* snow and wind */
  float snow = snowLayer(uv, u_t, 6., .55, 1.) * .7 + snowLayer(uv, u_t, 10., .8, 7.) * .8 + snowLayer(uv, u_t, 17., 1.1, 13.) * .9;
  L += snow;
  float row = floor(uv.y * 22.), rh = hash11(row);
  float gx = fract(uv.x * .35 - u_t * (.4 + rh * .9) * (.4 + u_wind) + rh * 7.);
  float gust = clamp((u_wind - .55) / .6, 0., 1.);
  L += smoothstep(0., .5, gx) * smoothstep(.55, .5, gx) * smoothstep(.07, 0., abs(fract(uv.y * 22.) - .5)) * step(.82, rh) * (.12 + .5 * gust);

  /* cursor torch, shock ring, flash */
  vec2 m = uv - (u_mouse * 2. - 1.) * vec2(aspect, 1.);
  L += .35 * exp(-dot(m, m) * 9.) * (.6 + .8 * u_charge);
  L += smoothstep(.03, 0., abs(length(uv - S) - u_ringR)) * u_ringA;
  L += u_flash * .8;

  /* vignette and fade-in */
  L *= 1. - .55 * smoothstep(.5, 1.7, length(uv * vec2(.75, 1.)));
  L *= u_intro; R *= u_intro;

  /* halftone: bone dots for light, red dots for fire, like a printed page */
  float cs = max(4.5, u_res.y / 150.), fw = .85 / cs;
  float a1 = .785, a2 = .26;
  vec2 g1 = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * fc / cs;
  vec2 g2 = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * fc / cs;
  float rl = sqrt(clamp(L, 0., 1.)) * .74, rr = sqrt(clamp(R, 0., 1.)) * .70;
  float dl = smoothstep(rl + fw, rl - fw, length(fract(g1) - .5));
  float dr = smoothstep(rr + fw, rr - fw, length(fract(g2) - .5));
  vec3 ink = vec3(.02, .02, .024), paper = vec3(.93, .92, .90), red = vec3(.76, .07, .12);
  vec3 col = mix(ink, paper, dl * step(.02, L));
  col = mix(col, red, dr * step(.02, R));
  col = mix(col, paper, smoothstep(1., 1.25, L));
  gl_FragColor = vec4(col, 1.);
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function makeGL(cv) {
  const gl = cv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  try {
    const pr = gl.createProgram();
    gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['u_res', 'u_t', 'u_p', 'u_burn', 'u_intro', 'u_flash', 'u_charge', 'u_speed', 'u_wind', 'u_ringR', 'u_ringA', 'u_fixed', 'u_mouse']
      .forEach((k) => { U[k] = gl.getUniformLocation(pr, k); });
    return { gl, U };
  } catch (e) {
    console.warn('SOLO: the summit shader could not start; showing a plain backdrop.', e);
    return null;
  }
}

function create(cv, opts = {}) {
  const fixed = !!opts.fixed;
  const target = { pan: 0, burn: 0, intro: 0, ...(opts.init || {}) };
  const cur = { ...target };
  let g = makeGL(cv), lost = false;
  const ctx2d = g ? null : cv.getContext('2d');
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  cv.addEventListener('webglcontextrestored', () => { g = makeGL(cv); lost = false; });

  let W = 1, H = 1, DPR = 1, t = 0, lastT = 0, active = true;
  let charge = 0, charging = false, vel = 0, speed = 0, prevPan = cur.pan, flash = 0, ringR = 0, ringA = 0;
  const sm = { x: 0.5, y: 0.5 };
  const dprCap = Math.min(devicePixelRatio || 1, 1.75);

  function resize() {
    const b = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(b.width)); H = Math.max(1, Math.round(b.height));
    DPR = Math.min(dprCap, Math.sqrt(4000000 / (W * H)));     // keep the pixel count sane on huge screens
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }

  function shock(power = 1) {
    flash = Math.min(1, 0.5 + power * 0.5);
    ringR = 0.02; ringA = 1;
  }

  if (opts.interact) {
    addEventListener('pointerdown', (e) => { if (!active || e.target.closest('a,button')) return; charging = true; });
    const release = () => { if (!charging) return; charging = false; shock(Math.max(0.35, charge)); charge = 0; };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
  }

  function render() {
    const intro = 1 - Math.pow(1 - clamp(cur.intro, 0, 1), 3);
    if (!g) {
      ctx2d.fillStyle = '#050506'; ctx2d.fillRect(0, 0, cv.width, cv.height);
      return;
    }
    const { gl, U } = g;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(U.u_res, cv.width, cv.height);
    gl.uniform1f(U.u_t, reduce() ? 0 : t);
    gl.uniform1f(U.u_p, fixed ? 0.95 : cur.pan);
    gl.uniform1f(U.u_burn, cur.burn + charge * 0.6);
    gl.uniform1f(U.u_intro, intro);
    gl.uniform1f(U.u_flash, flash);
    gl.uniform1f(U.u_charge, charge);
    gl.uniform1f(U.u_speed, reduce() ? 0 : speed);
    gl.uniform1f(U.u_wind, reduce() ? 0.3 : windAt(t));
    gl.uniform1f(U.u_ringR, ringR);
    gl.uniform1f(U.u_ringA, ringA);
    gl.uniform1f(U.u_fixed, fixed ? 1 : 0);
    gl.uniform2f(U.u_mouse, sm.x, 1 - sm.y);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!active || lost) return;
    if (Math.round(cv.clientWidth) !== W || Math.round(cv.clientHeight) !== H) resize();
    t = now / 1000;
    const dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
    for (const key in target) cur[key] += (target[key] - cur[key]) * (1 - Math.exp(-dt * (key === 'intro' ? 2.4 : 6)));
    const fm = 1 - Math.exp(-dt * 5);
    sm.x += (mouse.x - sm.x) * fm; sm.y += (mouse.y - sm.y) * fm;
    charge = charging ? Math.min(1, charge + dt * 0.9) : Math.max(0, charge - dt * 2);
    const inst = dt > 0 ? Math.abs(cur.pan - prevPan) / dt : 0; prevPan = cur.pan;
    vel += (inst - vel) * (1 - Math.exp(-dt * 6));
    speed = clamp(vel * 7, 0, 1);
    flash *= Math.exp(-dt * 4.5);
    if (ringA > 0.01) { ringR += dt * 1.6; ringA *= Math.exp(-dt * 1.8); }
    render();
  }

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(cv); else addEventListener('resize', resize);
  requestAnimationFrame(frame);

  return { target, shock, setActive: (v) => { active = v; } };
}

export const Scene = { create };
