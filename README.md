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
- **Accounts (optional)**: sign up to save every test to your account. Without the server the game runs in
  guest mode and keeps progress in the browser (localStorage), as on the GitHub Pages site.
- **Leaderboards**: each player's best run for every standard test, for today, this week or all time.
- **Live races**: quick match with whoever is waiting, or a private race with a 5-letter code and an invite link.
  Up to 5 racers see each other's progress live, and the server decides places and speeds.

## How it fits together

```
 browser (index.html + js/)                     server/ (Node 24)
 ──────────────────────────                     ─────────────────────────────────────────
 game, stats, ranks (local)                     Express 5
 api.js ──── fetch /api/* (JSON) ────────────▶  routes.js → validate.js → db.js → Postgres
 race.js ─── Socket.IO (WebSocket) ──────────▶  race/server.js (rooms, timers)
                                                   └─ race/room.js (pure race rules)
```

The browser never decides anything that matters for fairness. It reports how far the player has typed, and
the server checks it against its own clock, rejects impossible speeds, and assigns places.

## Run it with accounts

The `server/` folder is a Node API (Express 5) that also serves the site. It needs Node 22 or newer.

The database is Postgres. In production that is a real Postgres server (Neon). Locally and in the tests it is
[PGlite](https://pglite.dev), Postgres compiled to WebAssembly that runs inside Node, so the same SQL runs
everywhere and there is still nothing to install.

```bash
cd server
npm install
npm start
```

Then open http://localhost:3000.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DATABASE_URL` | | Postgres connection string. Required in production; when unset, PGlite is used |
| `DATA_DIR` | `server/data/pglite` | Where local PGlite keeps its data |
| `NODE_ENV` | | Set to `production` behind HTTPS: secure cookies, the real client IP for rate limits, and `DATABASE_URL` required |

### API

Every response is `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "..." }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | | Health check |
| POST | `/api/auth/register` | | Create an account `{ username, password }` and sign in |
| POST | `/api/auth/login` | | Sign in |
| POST | `/api/auth/logout` | | Sign out |
| GET | `/api/me` | | The signed-in user, or `null` |
| POST | `/api/results` | yes | Save a finished test `{ wpm, raw, acc, cons, mode, amount }` |
| GET | `/api/results?limit=50` | yes | Your results, newest first, plus a summary |
| GET | `/api/leaderboard?mode=time&amount=30&period=week` | | Best run per player; period is `day`, `week` or `all` |

### Races (Socket.IO)

Every client event takes an acknowledgement callback that receives `{ ok, code? }` or `{ ok: false, error }`.

| Client sends | What it does |
|---|---|
| `race:quick` | Join a public room that is waiting, or open one. It starts 8 s after a second racer arrives |
| `race:create` | Open a private room and get its code |
| `race:join` `{ code }` | Join a room by code |
| `race:start` | Host only: 3 s countdown, then the race |
| `race:progress` `{ chars }` | Characters typed correctly so far |
| `race:again` | Host only, after a race: same room, new passage |
| `race:leave` | Leave the room |

The server sends `race:hello` `{ name }` on connect and `race:state` (the whole room) after every change. A
race ends when everyone still in it has finished, or after two minutes.

### Security

- Passwords are hashed with scrypt and a random salt. Login fails the same way, in about the same time,
  whether or not the username exists.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie. The database stores only a SHA-256 hash
  of each token.
- Writes from other sites are refused (an `Origin` check), and request bodies are limited to 10 KB.
- Login and register are rate limited to 10 a minute per IP, and saving results to 30 a minute.
- Results are checked on the server: impossible speeds (over 350 wpm), wpm above raw speed, and accuracy
  outside 0 to 100 are rejected.
- Only `index.html`, `og-image.png`, `css/` and `js/` are served; the server code and repo files never are.
- Races are timed by the server. Progress faster than 350 wpm, progress that goes backwards, and progress past
  the end of the passage are all rejected. Each socket may send 20 events a second, there are at most 500
  rooms, and WebSocket connections from other sites are refused.
- Players are shown by name only; socket ids never leave the server.

## Docker

```bash
docker build -t keyblaze .
docker run -p 3000:3000 -e DATABASE_URL=postgres://user:password@host:5432/db keyblaze
```

The image runs as a non-root user and has a health check on `/api/health`.

## Deploy (Render + Neon, both free)

1. **Database:** create a free project on [Neon](https://neon.tech) and copy its connection string
   (`postgresql://…?sslmode=require`). The server creates its tables on first start.
2. **Server:** on [Render](https://render.com), choose **New → Blueprint**, pick this repository, and paste the
   Neon string when it asks for `DATABASE_URL`. `render.yaml` sets up the rest (Docker, health check, deploy on
   every push to `main`).

Render's free plan sleeps after 15 minutes without visitors, so the first visit after that takes about a
minute to wake it. The data is safe in Neon either way.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request: both test suites, then a
Docker build that starts the container against a throwaway Postgres and creates an account through the API.

## Run it as a static site

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

The rating, stats, word, level, API client and race progress logic is pure JavaScript with tests for Node's built-in runner:

```bash
node --test tests/*.test.js
```

The server has its own tests: the race rules as pure functions, plus integration tests that start the server
on a free port with an in-memory Postgres (PGlite) and race real Socket.IO clients against it:

```bash
cd server
npm test
```

## Credits

- [SplashCursor](https://reactbits.dev) and [FlexCarousel](https://reactbits.dev) from React Bits, ported to
  plain JavaScript.
- Fonts: Instrument Serif, Geist and Geist Mono from Google Fonts.
