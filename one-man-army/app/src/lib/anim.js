export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smooth = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
export const trap = (p, a, b, c, d) => smooth(a, b, p) * (1 - smooth(c, d, p));
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
