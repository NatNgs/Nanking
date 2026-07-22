# Nanking

Tool for ranking entries using various criterions (user notation, pair comparisons, ...).

Backend: Node.js/Express. Frontend: React, built with Vite. The server runs directly
from its sources (`src/server/`, plain ES modules — nothing to compile there); only
the client is built, into `dist/client/`.

## Configuration

The server reads its configuration from a YAML file, selected by environment name:
`conf/conf.<env>.yml`. The environment name is resolved from the `--env=<name>`
command-line flag, then the `ENV` environment variable, then defaults to `local`. If
the resulting file is missing or invalid, the server logs a warning and starts with
default values instead of failing.

```sh
node src/server/server.js --env=local   # reads conf/conf.local.yml (also the default)
ENV=test node src/server/server.js      # reads conf/conf.test.yml
```

Every value has a default, overridable via the config file:

| Key | Default | Purpose |
|---|---|---|
| `port` | `8053` | Port the server listens on |
| `cert.keyPath` / `cert.certPath` | *(none)* | TLS private key/certificate — see below |
| `dbPath` | `data/NankingServerData.gz` | Gzip-compressed database file |
| `clientDistPath` | `dist/client` | Compiled React app served as static files |
| `token.validityLimit` | 16 hours (seconds) | Absolute session token expiration |
| `token.refreshRate` | 1 hour (seconds) | Minimum delay between two token refreshes |
| `shutdownTimeout` | 60 seconds | Force-exit delay if graceful shutdown hangs |
| `dataDir` | `data` | Directory for auxiliary data (e.g. uploaded entry images) |
| `scoreComputeInterval` | 3 seconds | Interval between two score recomputation cycles |
| `rateLimit.<login\|api\|publicProfile\|page>.limit` / `.windowSeconds` | see `rateLimit.js` | Per-route request rate limits |

**HTTPS certificate**: the server starts in plain HTTP mode unless `cert.keyPath` is
set in the loaded config file. When it is set, the server reads the certificate and
starts over HTTPS, for example:

```sh
mkdir cert
openssl req -x509 -newkey rsa:2048 -nodes -keyout cert/server.key -out cert/server.cert -days 365
```

```yaml
# conf/conf.local.yml
cert:
  keyPath: ./cert/server.key
  certPath: ./cert/server.cert
```

If `cert.keyPath`/`cert.certPath` point to a missing or unreadable file, the server
logs an error and exits (exit code 1) rather than starting without transport
encryption. With no `cert` section at all (the default), the server starts in plain
HTTP mode — intended for local development only, never for production.

## Installation

```sh
npm install
```

Installing dependencies automatically triggers a build (`postinstall`, see below), so
`dist/client/` is ready right after `npm install` completes.

## Build

```sh
npm run build
```

Builds the React client with Vite into `dist/client/`. There is nothing to build on
the server side — `src/server/` is plain ES modules, run as-is.

## Running the application

```sh
npm run serve
```

Runs `src/server/server.js` directly (requires `dist/client/` to exist — see
[Build](#build) — and, if HTTPS is configured, a certificate in `cert/` — see
[Configuration](#configuration)).

For development, with hot-reload on the client and the Express server running against
the sources directly:

```sh
npm run dev
```

This starts the Express server (`npm run serve`) and the Vite dev server together
(`concurrently`). With no `cert` section in `conf/conf.local.yml`, the Express
server runs in plain HTTP mode. The Vite dev server proxies `/api` requests to the
Express server (see `vite.config.js`), so the app behaves the same as in production
while the client hot-reloads on change.

To test against HTTPS during development, add a `cert` section to
`conf/conf.local.yml` pointing to a local certificate, then run `npm run dev` as
usual.

## TODO List

- Consider migrating session handling to `express-session` (see below)
- Use a real BDD instead of saving/loading json every 15min
- Improve dual picker (reduce chance to pick already compared entries, or transitively compared ones, increase chance to pick entries with low number of dual aleady done with them, increased chance to pick entries with only winning duals)
- Possibility to manually chose what entry to dual (either no manual selection => automatic, or one selected and other automatic, or both manual)
- Display on authenticated users' entry pages, the tree of what pushes their scores up or down (all the duals and the related scores)
- Create a category of tags "MetaTags", that can have only MetaTags as parents, and cannot have scores (only serve to group subTags or entries)
- Create a generic item object, and all Entries, Tags and Metatags inherit it (that seems possible, and so is logic to do)
- Create a user Admin boolean. If set to true, admin can access to all modifiable actions, whether or not they has the entry in their list
- When real database: Allow users to have a personal display name for entries (that only show for them), with a button to reset to default name
- When real database: Create multiple "Sections". Every section has its own items and tags, with no relation to other sections. For example a music section, a manga section, a TV show section, a book section, a restaurants section... all in one site !! May work as a Meta-Metatag, reflexion to be done...
- Share filtered user table: Make public link /user/usename filtrable with query params to filter/sort the content (for example ?hasTag=french to only show french items from the username list)

### Possible migration to `express-session`

Not decided yet. The current homemade token system (`src/server/data/accounts.js`)
works, but a cookie-based session via `express-session` would bring `HttpOnly`
protection against token theft via XSS — the current token is readable by any script
through `localStorage`, which a cookie flagged `HttpOnly` is not.

Server-side impact:

- Replace the `tokens`/`tokens_reverse` maps and the `Authorization` header convention
  with `req.session`, backed by the default `MemoryStore` (or an external store, if
  ever needed).
- The IP-binding and hashed-storage work done in `accounts.js` would need to be
  reconsidered: `express-session` does not bind sessions to an IP by default, and the
  session ID is opaque to the application (no more custom hashing needed, since the
  session store already keeps the mapping outside of readable memory in the same way).
- Rate-limiting (`src/server/middleware/rateLimit.js`) would switch its authenticated
  key from `req.user.username` to whatever `express-session` exposes once wired in.

Client-side impact (see `src/client/hooks/useApi.js` and `src/client/hooks/useAuth.js`
— the only two files that know about the token mechanism; every page/component goes
through `apiGet`/`apiPost`/`apiPut` and would not change):

- `useApi.js`: `apiFetch()` currently attaches the token manually to the
  `Authorization` header and persists the response header back to `localStorage` on
  every call. With cookie-based sessions, this logic is simply removed — the browser
  attaches the cookie automatically. The `fetch()` call needs
  `credentials: 'include'` added so it actually sends/accepts the cookie.
- `useAuth.js`: the mount effect currently checks `localStorage.getItem('token')` to
  decide whether to attempt auto-login; with a cookie, that check must become an
  unconditional call to a `/user/me`-style endpoint, since the client can no longer
  inspect the session cookie's presence directly (especially once `HttpOnly` is set).
  `login()`/`register()` no longer need to read the `authorization` response header
  or write to `localStorage` — the server sets the cookie via `Set-Cookie`. `logOut()`
  can no longer clear the cookie itself; it needs a server-side logout endpoint that
  calls `req.session.destroy()`.
- The client-side SHA-512 password hashing (`useAuth.js`) is unaffected either way —
  it is independent of the session transport mechanism.

Net effect on the client: a dozen lines removed across 2 hooks, no new complexity —
the browser takes over cookie lifecycle management instead of the client-side JS
doing it by hand.

### Rate-limiting

Implemented via `express-rate-limit` (`src/server/middleware/rateLimit.js`), with four
distinct limiters (defaults below, all overridable via `rateLimit.<name>.limit` /
`.windowSeconds` — see [Configuration](#configuration)):

| Limiter | Default | Keyed by | Applies to |
|---|---|---|---|
| `loginLimiter` | 6 req / 60s | IP | `POST /api/login` — slows down brute-force attempts on account passwords |
| `apiLimiter` | 120 req / 60s | authenticated username, falls back to IP | every route under `/api` |
| `publicProfileLimiter` | 30 req / 60s | IP | `GET /api/user/:username` (public profile), in addition to `apiLimiter` |
| `pageLimiter` | 60 req / 60s | IP | non-API routes (`/`, static files) |

Username-based keying (where used) avoids penalizing multiple users behind the same
NAT/proxy.

Limiter state is kept in memory (the default `MemoryStore`), sufficient for a
single-instance server like this one; revisit only if the server is ever run as
multiple instances behind a load-balancer, in which case a shared store would be
needed. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After`
header so the client can inform the user rather than silently failing.

## Suggestions

Improvement ideas for the existing codebase — performance and maintainability only,
no new features. Not prioritized against the [TODO List](#todo-list) above; both are
candidates for future work.

### Server (`src/server/`)

**Performance**

- `entries.js`/`tags.js`: name/label lookups (`getEntryByName`, `getTagByLabel`, their
  `IgnoreCase` variants) scan the full collection linearly on every call (creation,
  rename-conflict check, ...). Maintaining a `name → entry` / `label → tag` side map
  would make these O(1) instead of O(n).
- `scoresComputerService.js`: `computeUserTagScores`/`computeGlobalTagScores` re-scan
  every entry for every tag on every cycle (O(tags × entries)), and `tags.js`'s
  `getDirectChildren` is recomputed from scratch each time it's called in these loops
  (including from `topologicalOrder`, already O(tags²) on its own). A once-per-cycle
  `tagId → entryIds` / `tagId → children` index, built once and reused, would remove
  most of this redundant work.
- `launchComputation` recomputes every user's scores on every cycle (every
  `scoreComputeInterval`, 3s by default), even users with no new activity since the
  last cycle. A "dirty" flag set by `didQuiz`/`removeQuiz` would let the cycle skip
  users with nothing to recompute.
- `db.js`: `save()` does a synchronous `JSON.stringify` + `gzipSync` +
  `writeFileSync` over the entire in-memory database. Fine at startup (once), but
  worth moving to async equivalents for the periodic/shutdown save, so it doesn't
  block the event loop as the database grows.

**Maintainability**

- `entryService.js` and `tagService.js` duplicate the same
  find-by-name/validate/conflict/save shape for `renameEntry`/`renameTag`. A shared
  helper (e.g. `renameNamedResource(manager, id, newName, {...})`) would remove the
  duplication and keep the `'not_found'|'invalid'|'conflict'|'ok'` contract in one
  place instead of two.
- `userService.js`'s `setEntryScore` calls `user.setEntryScore(...)`, a method that
  does not exist on the `User` class (`data/user.js`) — dead code that would throw if
  ever wired to a route. It's imported in `userRoutes.js` but not mounted anywhere.
  Either remove it, or implement it if a "manual direct score" route is actually
  planned.
- `quizRoutes.js`: `POST`/`DELETE '/default'` and `'/dual'` build a `DefaultValueQuiz`/
  `DualQuiz` directly from `ENTRIES.getEntryById(req.body.*)` with no existence check;
  a missing/invalid id throws an uncaught `QuizError` from the constructor, surfacing
  as an unhandled 500 instead of a clean 400/404 like the rest of the API. Validate
  the referenced entries exist before constructing the quiz.
- `quizRoutes.js` duplicates the same "recompute until stable" loop
  (`for(...) totalUpdate = computeUserScores(user)`) in both the `POST` and `DELETE`
  handlers. Worth extracting into a single `recomputeUntilStable(user)` in
  `scoresComputerService.js`.
- `tags.js`'s `save()` silently prunes tags no longer referenced by any entry, as a
  side effect of persistence (`_isUsedByAnyEntry`) — a real, surprising behavior that
  is not documented anywhere except that one comment. Extracting it into a clearly
  named `pruneOrphanTags()` would make it discoverable and testable on its own.

### Client (`src/client/`)

**Performance**

- `vite.config.js` explicitly disables minification and enables sourcemaps for the
  build (`minify: false`, `sourcemap: true`), with no comment indicating whether
  that's an intentional production trade-off or a leftover debug setting. Current
  build: ~1033 kB JS (223 kB gzip) plus a ~1956 kB sourcemap shipped alongside. Worth
  confirming intent, and switching to `minify: true` / `sourcemap: 'hidden'` for
  production if not deliberate.
- `GlobalScoresPanel` and `EntriesPanel` are both mounted at once on the home page for
  an authenticated user, each running its own independent 30s polling interval via
  `usePaginatedList`'s `refreshIntervalMs`. Two uncoordinated requests fire every 30s
  with no shared scheduling. A shared "tick" source (single `setInterval` that
  `usePaginatedList` instances subscribe to) would remove the duplication.
- `usePaginatedList`'s `fetchPage` has no `try/catch`: a failed request (including
  during background polling) becomes an unhandled promise rejection, silently — none
  of its consumers (`EntriesPanel`, `GlobalScoresPanel`, `ProfilePage`, `TagPage`'s
  entries list, `RecentVotesTable`) show an error or retry.

**Maintainability**

- Error handling is inconsistent across views: `TagPage`/`EntryPage`/
  `useRenamePrompt` show a proper error message on failure, while
  `GlobalScoresPanel`/`ProfilePage` have none at all, and `DualQuiz.vote()`/
  `RecentVotesTable.onDelete()` have no `try/catch` around their API calls — a failed
  vote or delete fails silently. Worth standardizing on one pattern (e.g. an `error`
  state + `<p role="alert">`), starting with `usePaginatedList` itself.
- User-facing messages mix French and English for the same feature: `EntryPage.jsx`'s
  rename/tag/delete errors are in French ("Nouveau nom pour", "Échec du renommage",
  ...) while `TagPage.jsx`'s equivalent messages (same `useRenamePrompt` hook) are in
  English ("Rename failed", "Failed to add tag", ...). Pick one language for
  user-facing text (or introduce a light i18n layer if bilingual is actually intended).
- The `<ScoreTable>` + `<PaginationControls>` + `usePaginatedList` combo is repeated
  nearly identically in `GlobalScoresPanel`, `ProfilePage`, `EntriesPanel`, and
  `TagPage`'s entries section — only the endpoint and `columns` differ. A composite
  `PaginatedScoreTable({endpoint, columns, scoreFormatter, ...})` component would
  remove that remaining boilerplate.
- `EntryPage.jsx` (~190 lines) owns rename, image upload (with its own validation),
  tag add/remove, score removal with confirmation, and auth-change resync — five
  separate `isX` booleans combined into one `isBusy`. Extracting at least the image
  upload logic into its own hook (mirroring `useRenamePrompt`) would shrink it.
- Minor accessibility gaps: `ScoreTable`'s sortable column headers (`<th onClick=...>`)
  aren't keyboard-focusable/-activatable (no `tabIndex`/`role="button"`/`onKeyDown`),
  unlike `PaginationControls` which already handles this; `UserMenu`'s trigger button
  has no `aria-expanded`/`aria-haspopup`.
