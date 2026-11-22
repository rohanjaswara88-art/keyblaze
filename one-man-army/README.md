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

- `app/src/components/Katana.jsx` — the katana, drawn in code as separate parts (kashira, tsuka, fuchi, tsuba,
  seppa, habaki, blade) with a cherry-blossom branch on the blade.
- `app/src/components/Showcase.jsx` — the scroll: hero pose, pulls apart, zooms into each part with a details panel.
- `app/src/data/parts.js` — the text for each part.
- `app/src/components/rb/` — React Bits components in use: SplitText, ShinyText, DecryptedText (the rest are kept for later).
- `app/src/_archive/` — the earlier sections (brutal-quotes creed, flashlight text, numbers, finale, mountain scene),
  parked until we add them back.
