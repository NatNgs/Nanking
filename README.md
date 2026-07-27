# Nanking

Tool for ranking entries using various criterions (user notation, pair comparisons, ...).

Backend: Node.js/Express. Frontend: React, built with Vite. The server runs directly
from its sources (`src/server/`, plain ES modules - nothing to compile there); only
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
| `cert.keyPath` / `cert.certPath` | *(none)* | TLS private key/certificate - see below |
| `dbPath` | `data/NankingServerData.gz` | Legacy gzip-compressed JSON database, imported once - see below |
| `sqlitePath` | `data/nanking.sqlite` | SQLite database file (source of truth once created) |
| `clientDistPath` | `dist/client` | Compiled React app served as static files |
| `token.validityLimit` | 16 hours (seconds) | Session cookie max age (`express-session`'s `cookie.maxAge`, sliding - see below) |
| `session.secret` | *(none - insecure placeholder, warns)* | Secret used to sign the session ID cookie - see below |
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
HTTP mode - intended for local development only, never for production.

**Sessions**: authentication is a cookie-based `express-session` (`HttpOnly`, and
`Secure` whenever `cert` is configured), backed by the default in-memory
`MemoryStore` - sessions do not survive a server restart (acceptable for this
single-instance server; revisit with a persistent store only if that becomes an
issue). The cookie is signed with `session.secret`; if unset, the server logs a
warning and falls back to an insecure generated placeholder - always set it for
production:

```yaml
# conf/conf.local.yml
session:
  secret: some-long-random-string
```

**Database**: the server persists to a SQLite file (`sqlitePath`, via Node's native
`node:sqlite`), never to the legacy JSON file directly. On startup:

- If the SQLite file already exists, it is loaded as-is - `dbPath` is ignored entirely.
- If it doesn't exist yet, a fresh SQLite database is created, and the legacy JSON
  file (`dbPath`), if present, is imported into it once. The JSON file is then renamed
  to `<dbPath>.imported` so it's obviously no longer live; the server never reads
  it again afterwards.

See `src/server/data/sqliteDb.js` for the schema and `src/server/services/
persistenceService.js` for the read/write logic. The in-memory data model
(`src/server/data/{entries,tags,accounts,user}.js`) is unaware of SQLite - it stays a
set of plain data containers, translated to/from SQLite only by `persistenceService.js`.
No application logic uses relational queries yet (see [TODO.md](TODO.md)).

**Database access**: some fields (e.g. the Admin flag below) are deliberately not
exposed through any API route or UI, and can only be changed with direct SQLite
access. Always **stop the server first** - `node:sqlite` locks the file exclusively
while the server runs, and any change made while it's up would be silently
overwritten by the next in-memory save (`saveAccounts()`/`saveEntries()`/... - see
`persistenceService.js`).

Using the `sqlite3` CLI (or any SQLite client/GUI - DB Browser for SQLite, DBeaver,
the VS Code SQLite extension, ...) against the file configured as `sqlitePath`
(`data/nanking.sqlite` by default):

```sh
sqlite3 data/nanking.sqlite
```

```sql
-- List accounts and their current Admin status
SELECT username, is_admin FROM accounts;

-- Grant Admin
UPDATE accounts SET is_admin = 1 WHERE username = 'somebody';

-- Revoke Admin
UPDATE accounts SET is_admin = 0 WHERE username = 'somebody';
```

Without the `sqlite3` CLI installed, the same `UPDATE` can be run one-off with
Node.js directly (uses the same `node:sqlite` module the server itself uses, no
extra dependency):

```sh
node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('data/nanking.sqlite'); db.exec(\"UPDATE accounts SET is_admin = 1 WHERE username = 'somebody'\"); db.close()"
```

Start the server again afterwards for the change to be loaded (`loadAccounts()` reads
`accounts` once at startup - see `persistenceService.js`).

**Admin flag** (`accounts.is_admin`, default `0`/false): grants no dedicated UI or
route of its own - an Admin can edit any entry (rename, change picture, add/remove
tags) from its `/entry/:id` page even without a personal score on it, same as any
other user would on their own scored entries (see `EntryPage.jsx`, `getEntryData()`
in `entryService.js`). Deliberately never settable through the application itself
(no signup flag, no promotion route) - always grant/revoke it directly in SQLite, as
shown above.

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
the server side - `src/server/` is plain ES modules, run as-is.

## Running the application

```sh
npm run serve
```

Runs `src/server/server.js` directly (requires `dist/client/` to exist - see
[Build](#build) - and, if HTTPS is configured, a certificate in `cert/` - see
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

## Rate-limiting

Implemented via `express-rate-limit` (`src/server/middleware/rateLimit.js`), with four
distinct limiters, all overridable via `rateLimit.<name>.limit` / `.windowSeconds` -
see [Configuration](#configuration). Details (per-limiter defaults, keying, rationale)
moved to [TODO.md](TODO.md#rate-limiting).

## TODO list and improvement suggestions

Moved to [TODO.md](TODO.md), to keep this README focused on running/configuring the
application.
