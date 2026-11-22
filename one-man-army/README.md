# SOLO — one man, no limits

A scroll-driven film about one man doing the impossible. React, GSAP, Lenis, a WebGL shader scene,
and [React Bits](https://reactbits.dev) components. There are no image files: every visual is generated in code.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `assets/` | The **built site**. This is what gets served (for example from GitHub Pages at `/one-man-army/`). |
| `app/` | The React source. |

## Develop

```powershell
cd one-man-army/app
npm install
npm run dev        # http://127.0.0.1:5180
```

## Rebuild the served site

```powershell
cd one-man-army/app
npm run build      # writes ../index.html and ../assets
```

## What is where

- `app/src/lib/summit.js` — the scene: a halftone mountain drawn by a fragment shader. Scroll is altitude; the
  ranges slide down while an ember climbs the slope, then lifts into a burning star. Snow, wind, cursor torch,
  hold-to-charge and a shock ring.
- `app/src/components/Creed.jsx` — the brutal quotes, pinned and scrubbed.
- `app/src/components/rb/` — React Bits components in use: SplitText, ShinyText, DotGrid, DecryptedText,
  ScrollVelocity, CountUp, ClickSpark, Magnet, FuzzyText.
