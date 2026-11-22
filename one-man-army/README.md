# SOLO — one man, no limits

A scroll-driven film about one man doing the impossible. React, GSAP, Lenis, a WebGL scene,
and [React Bits](https://reactbits.dev) components.

## Layout

| Path | What it is |
| --- | --- |
| `index.html`, `assets/` | The **built site**. This is what gets served (for example from GitHub Pages at `/one-man-army/`). |
| `media/` | The artwork, cut into layers (background, wings, the climber's parts). |
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

- `app/src/lib/ascent.js` — the scene. The climber stays put on screen while the mountain slides under him;
  his wings are attached to his shoulders and follow with spring physics; wind moves his bag; snow falls.
- `app/src/components/Creed.jsx` — the brutal quotes, pinned and scrubbed.
- `app/src/components/rb/` — React Bits components in use: SplitText, ShinyText, DotGrid, DecryptedText,
  ScrollVelocity, CountUp, ClickSpark, Magnet, FuzzyText.

The artwork was supplied by the site owner; check you have the right to use it before publishing.
