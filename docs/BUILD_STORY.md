# How Keyblaze was built

Keyblaze started as a static typing speed test on GitHub Pages and grew into a full-stack app with accounts,
leaderboards and live multiplayer races. This document explains how it works, how it was built in phases, and
the problems found along the way and how each was solved.

- **Live app:** https://keyblaze.onrender.com (accounts, leaderboards, live races)
- **Guest version:** https://rohanjaswara88-art.github.io/keyblaze/ (the game only, no server)
- **Visual explainer:** https://rohanjaswara88-art.github.io/keyblaze/docs/explainer.html (this story in two
  minutes)

## Where everything runs

| Piece | Service | Notes |
|---|---|---|
| Code and CI | GitHub | Every pull request runs the tests and a Docker smoke test |
| Server | Render (free web service, Singapore) | Built from the `Dockerfile`, redeploys on every push to `main` |
| Database | Neon (free Postgres, Singapore) | Users, sessions and results |
| Guest site | GitHub Pages | The static files only |

The server and the database are both in Singapore: it is the closest region to India, and keeping the two
next to each other makes every database call fast.

## Architecture

```
Browser (index.html + js/)                 Render (Node server)              Neon
──────────────────────────                 ────────────────────              ────
typing game (runs in the browser)
api.js ──── HTTPS: /api/... ───────▶  Express routes ─▶ db.js ─────▶  Postgres
race.js ─── WebSocket (Socket.IO) ─▶  race/server.js
                                        └ race/room.js (race rules)
```

One Node server does three jobs: it serves the game's files, answers the JSON API, and runs live races over
WebSockets. Serving the site and the API from the same origin lets login use a secure, `HttpOnly` cookie.

## Phase 1: Accounts and saved results

- **Server:** Node 24 and Express 5 in `server/`.
- **Passwords** are hashed with scrypt and a random salt, so the database never holds a real password.
- **Sessions:** a random token in an `HttpOnly`, `SameSite=Lax` cookie. The database stores only a SHA-256 hash
  of the token, so a database leak exposes no sessions.
- **Protection:** requests from other websites are refused (an `Origin` check), login is rate limited to 10
  attempts a minute per IP, and every input is validated. Results the server can see are impossible (over
  350 wpm, wpm above raw speed) are rejected.
- **Guest mode:** if the server is not reachable, as on GitHub Pages, the game hides the account features and
  works exactly as before.

## Phase 2: Leaderboards

One SQL query ranks players. A window function,
`ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY wpm DESC)`, picks each player's single best run, keeping
that run's accuracy and date, and then the players are ranked. Boards can be filtered to today, this week or
all time. Only the standard test lengths count; level tests use custom lengths and stay off the board.

## Phase 3: Live multiplayer races

- **Rules apart from networking.** `server/src/race/room.js` holds pure functions: each takes a room and
  returns a new room, with no sockets, timers or clock of its own. That makes every rule easy to test.
- **`server/src/race/server.js`** handles the live side: Socket.IO events, the 3-second countdown, the
  two-minute race limit, and quick-match auto-start.
- **The server is the referee.** The browser only reports "I have typed N correct characters". The server
  timestamps that with its own clock, works out speeds and places, and ignores progress faster than a human
  could type.
- **Edge cases:** the host leaving (hosting passes to the next player), players disconnecting mid-race,
  rematches, invite links (`?race=CODE`), a cap of 5 players per room and 500 rooms, and a limit of 20 events a
  second per connection.

## Phase 4: Production

- **Docker:** a small Node 24 image that runs as a non-root user and has a health check.
- **CI (GitHub Actions):** runs both test suites, builds the image, starts it against a throwaway Postgres,
  and creates an account through the API to prove the whole stack works.
- **Postgres everywhere.** Production uses Neon through the `pg` driver. Local development and the tests use
  [PGlite](https://pglite.dev), real Postgres compiled to WebAssembly that runs inside Node, so the exact same
  SQL is tested that production runs, with nothing to install.
- **Render Blueprint:** `render.yaml` describes the deployment as code. The database connection string is a
  secret entered in Render's dashboard and never stored in the repo.

## Problems and how they were solved

### Design problems

| Problem | Solution |
|---|---|
| GitHub Pages only serves static files; it cannot run a server | Added the Node server and kept a guest mode, so the Pages site still works |
| The first version stored data in SQLite, a file on disk. Free hosts wipe their disks on every deploy, so accounts would disappear | Moved to Postgres on Neon (free and persistent). All database code sits behind one module, `db.js` (the repository pattern), so only that file had to change |
| The `pg` driver returns large integers and averages as text (`"70.5"`), unlike PGlite | One `num()` conversion in `db.js`, plus a test that every field comes back as a real number |
| Most users are in India, far from the default US regions | Both the server and the database run in Singapore, the closest region, next to each other |

### Bugs found by testing

| Problem | Solution |
|---|---|
| The homepage returned 404 when the project lived inside a folder whose name starts with a dot. Express refuses to serve files from such paths | Serve files with a `root` option, so only the file name is checked, not its parent folders |
| The login rate limiter blocked the project's own test suite, because every test comes from the same IP | Made the limits configurable: high in normal tests, real values in a dedicated rate-limit test |
| **The race input got stuck.** When several words arrived in one input event (very fast typing, phone keyboards), the code only checked for one finished word | The input now consumes every finished word in the box at once. This only showed up when racing in a real browser |
| Two tests were wrong rather than the code: one used a 2-letter username (the minimum is 3), and one used a passage too short to trip the speed limit | Fixed the tests; the code was behaving correctly |

### Security

| Problem | Solution |
|---|---|
| `.env` files, which hold the database password, were not in `.gitignore` | Added `.env`, `.env.*` and `.neon` to `.gitignore` before any secret was written, so the password can never be committed |
| The server did not read `.env` files | Node's built-in `--env-file-if-exists`; no extra package |
| An automated typist reached 5,520 wpm | The anti-cheat check rejected it. The same check was confirmed on the live site, where an instant finish is refused |

### Deployment and environment

| Problem | Solution |
|---|---|
| After signing in to Render with GitHub, Render could not see any repositories | Signing in does not grant repository access. Installing Render's GitHub app on the `keyblaze` repository did |
| `npm` commands failed in PowerShell with "running scripts is disabled on this system" | Windows blocks PowerShell scripts by default. `npm.cmd` (or Command Prompt or Git Bash) works without changing any security setting |
| A live test failed with a DNS error (`ENOTFOUND`) | A one-off network blip on the testing machine; it passed when run again |

## What was checked on the live site

- Health check, leaderboard and sign-in state respond through the API.
- The server code, `.env.local`, `.git` and `render.yaml` all return 404: only the game's files are public.
- Security headers are present, and cross-site writes are refused.
- A two-player race over the internet ran from start to finish with correct places.
- An instant-finish cheat was rejected.

## Lessons

1. **Never trust the client.** The browser reports; the server decides speeds, places and what is valid.
2. **Keep logic apart from input and output.** Race rules as pure functions are easy to test.
3. **Make development match production.** PGlite locally and Postgres in production means the same SQL is
   tested everywhere.
4. **Keep secrets out of code.** Ignore env files first, use environment variables, and keep secrets in the
   hosting dashboard.
5. **Test in the real environment.** The stuck race input and the dot-folder 404 only appeared when running
   the actual app.
