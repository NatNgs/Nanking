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

- Implement Dual comparison mode, and first computed notes algorithm
- Uniformize client-side error handling: currently, a failed API call while a token
  expires mid-session does not always redirect to the login page (only `goToPage`
  does it; `callAPI`/`APIget`/`APIpost`/`APIput` callers must handle the error
  themselves, and most don't)
- Consider migrating session handling to `express-session` (see below)

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

Implemented via `express-rate-limit` (`src/server/middleware/rateLimit.js`), configured
per-route rather than globally, so `/login` has a stricter window than `/user/*`/`/quiz/*`:

- `POST /login`: 5 requests / minute, keyed by IP, to slow down brute-force attempts on
  account passwords.
- `/user/*`, `/quiz/*`: 60 requests / minute, keyed by authenticated username
  (`req.user.username`, set by the `authenticate` middleware that runs first) — an
  IP-based limit alone would penalize multiple users behind the same NAT/proxy. Falls
  back to IP if `req.user` is somehow not set.

Limiter state is kept in memory (the default `MemoryStore`), sufficient for a
single-instance server like this one; revisit only if the server is ever run as
multiple instances behind a load-balancer, in which case a shared store would be
needed. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After`
header so the client can inform the user rather than silently failing.
