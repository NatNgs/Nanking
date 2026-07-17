# Nanking

Tool for ranking entries using various criterions (user notation, pair comparisons, ...).

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

Client-side impact (see `src/client/scripts/navigation.js` and
`src/client/pages/home/home.js` — the only two files that know about the token
mechanism; every other client script goes through `APIget`/`APIpost`/`APIput` and
would not change):

- `navigation.js`: `goToPage()` and `callAPI()` currently attach the token manually to
  the `Authorization` header and persist the response header back to `localStorage`
  on every call. With cookie-based sessions, this logic is simply removed — the
  browser attaches the cookie automatically. `$.ajax` calls need
  `xhrFields: {withCredentials: true}` added so jQuery actually sends/accepts the
  cookie.
- `home.js`: `init()` currently checks `localStorage.getItem('token')` to decide
  whether to attempt auto-login; with a cookie, that check must become an
  unconditional call to a `/user/me`-style endpoint, since the client can no longer
  inspect the session cookie's presence directly (especially once `HttpOnly` is set).
  `login()`/`register()` no longer need to read the `authorization` response header
  or write to `localStorage` — the server sets the cookie via `Set-Cookie`. `logOut()`
  can no longer clear the cookie itself; it needs a server-side logout endpoint that
  calls `req.session.destroy()`.
- The client-side SHA-512 password hashing (`home.js`) is unaffected either way —
  it is independent of the session transport mechanism.

Net effect on the client: about a dozen lines removed across 2 files, no new
complexity — the browser takes over cookie lifecycle management instead of the
client-side JS doing it by hand.

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
