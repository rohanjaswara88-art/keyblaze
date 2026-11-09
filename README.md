# Keyblaze

### ▶ [Play it live: rohanjaswara88-art.github.io/keyblaze](https://rohanjaswara88-art.github.io/keyblaze/)

A calm, satisfying typing speed test: live WPM, a consistency graph, sound packs, a 37-step rank ladder with
animated emblems, and 13 difficulty levels with 10 tests each.

## Features

- **Typing test**: time and word modes, punctuation and numbers, live WPM and accuracy, flow combos.
- **Results**: WPM, raw speed, accuracy, consistency and a per-second graph of speed and errors.
- **Ranks**: 13 tiers from Stone to Apex (37 ranks), each with an animated stencil emblem.
- **Difficulty levels**: pick a badge in the landing page carousel. Every badge has 10 tests and every test is
  harder than the last (speed goal, accuracy goal, length, word types). Pass a test to unlock the next one.
- **Feel**: synthesized key sounds (thock, click, bubble, typewriter, pop), a fluid splash cursor, liquid glass
  UI and a violet nebula theme (plus four landscape themes).
- **Fast on phones**: a lite mode switches on automatically on phones and low-end devices.

Progress is saved in your browser (localStorage). There is no account and no server.

## Run it

It is plain HTML, CSS and JavaScript with no build step. Serve the folder with any static server:

```bash
python -m http.server 5173
```

Then open http://localhost:5173. Opening `index.html` directly from disk does not work, because the
carousel is an ES module.

The difficulty carousel loads [ogl](https://github.com/oframe/ogl) 1.0.11 from jsDelivr, so it needs an
internet connection. Without it the badges fall back to a plain row of cards.

## Performance

- `?fps` shows an fps counter in the corner.
- `?perf=lite` or `?perf=full` forces the performance mode (it is detected automatically otherwise).

## Tests

The rating, stats, word and level logic is pure JavaScript with tests for Node's built-in runner:

```bash
node --test tests/*.test.js
```

## Credits

- [SplashCursor](https://reactbits.dev) and [FlexCarousel](https://reactbits.dev) from React Bits, ported to
  plain JavaScript.
- Fonts: Instrument Serif, Geist and Geist Mono from Google Fonts.
