# Nanking — NankingServer (new implementation)

## Scope

New implementation of Nanking in progress, based on a Node.js/Express backend with in-memory persistence (gzip-compressed on disk) and a React SPA front-end built with Vite.

Files involved: [src/client/](../src/client), [src/server/](../src/server), [package.json](../package.json), [vite.config.js](../vite.config.js).

Sources live under `src/client/` (React) and `src/server/` (Express). `npm install` triggers a build (via `postinstall`) that compiles the client with Vite into `dist/client/`. The server has nothing to compile — it is plain ES modules, run directly from `src/server/` (`npm run serve` runs `src/server/server.js`). Only the client goes through a build step.

## 1. Application description and implemented features

### 1.1 Authentication

Home page (`/`) offering login and account creation.

- The password is hashed client-side using **SHA-512** (jsSHA library), salted with the login (lowercase) and a fixed constant, before any network transmission.
- On the server, the received hash is hashed again with a per-account random salt (`scrypt`), which is never transmitted by any API and is stored only in the database. The client-side hash therefore never reaches the server or the database in a directly reusable form.
- Account creation: sends the login and the client-side hash with a "new account" flag.
- Login: the server responds with a session token sent in a dedicated HTTP header.
- Automatic reconnection: the token is kept in `localStorage` and revalidated/refreshed on every authenticated request (sliding session).
- Logout: removes the local token and resets the client-side authentication state.
- Login constraints: restricted format (letters, digits, `_.-`, 4 to 20 characters), checked both client-side and server-side. Account lookup and uniqueness are always case-insensitive, but the login is displayed back to the user with the exact case it was typed in at registration (`displayLogin`, stored alongside the account, falls back to the lowercase lookup key for accounts created before this field existed).

### 1.2 Entry management and manual scores

Main page accessible after login:

- Add a new entry with a name and a manual score.
- Display a table of the user's entries with the manually entered score and a computed score, sorted by computed score descending.
- Change the score display format (0-100 percent, or 1-10 MAL-style format).
- Log out.

### 1.3 Pairwise comparison quiz ("dual")

- Random draw of two distinct entries among the user's own (minimum 3 entries required).
- Displays a duel frame with both entries side by side and three voting buttons: left preference, tie, right preference.
- The vote is sent to the server.

**Current state: feature not finalized.** The server receives the vote but does not persist it or recompute the "computed" score from it: that score stays strictly equal to the entered manual score. The comparison-based scoring mechanism (present in the Serverless version through transitive propagation, see [Serverless.md](Serverless.md)) is not yet ported to this new server.

### 1.4 Features not yet ported from the Serverless version

- MyAnimeList / Jikan import.
- Tag/category system per entry.
- Entry deletion/renaming, custom image management (each entry uses a hardcoded default image).
- Score computation through transitive vote propagation.

## 2. Technical architecture

### 2.1 Stack

- **Runtime**: Node.js, native ES modules (`"type": "module"`).
- **HTTP server**: Express 5, served over **HTTPS** by default (certificate required in the `cert/` folder, not included in the repository); a `--http` command-line flag forces plain HTTP for development (see [Authentication and security](#24-authentication-and-security)).
- **Middleware**: body-parser (`urlencoded` for login, `json` for application routes), `express-rate-limit` (see [Authentication and security](#24-authentication-and-security)).
- **Persistence**: in-memory JSON object, gzip-compressed on disk as a single file (see [Persistence](#25-data-persistence)).
- **Session identifiers**: `uuid` v4.
- **Front-end**: React, built with Vite (`react-router` for routing).
- **Entry point**: `src/server/server.js`, launched via `npm run serve` (run directly, not built/copied).
- Port 8053 by default, overridable through configuration; displays available LAN IPs on startup and handles graceful shutdown (SIGTERM/SIGINT/SIGHUP).

### 2.2 Folder organization

```
src/
├── client/                    React source (built by Vite into dist/client/)
│   ├── index.html              Vite entry point
│   ├── main.jsx                 Mounts <BrowserRouter><App/></BrowserRouter>
│   ├── App.jsx                  Route definitions ("/" renders Home or Main depending on auth state)
│   ├── assets/                Images (default placeholder)
│   ├── hooks/
│   │   ├── useAuth.js            Login/register/logout, token lifecycle
│   │   └── useApi.js             fetch-based GET/POST/PUT helpers, token header + refresh handling
│   ├── pages/
│   │   ├── home/HomePage.jsx      Login/register forms (unauthenticated)
│   │   └── main/MainPage.jsx      Entry list, scores, quiz launcher (authenticated)
│   ├── components/dual/DualQuiz.jsx   Pairwise voting duel component
│   └── lib/scoreFormatter.js     Score display format conversion (Percent/MAL)
└── server/
    ├── server.js               Entry point, Express configuration, public routes, startup/shutdown
    ├── config/                  Centralized configuration
    │   └── config.js              Port, certificate paths, DB path, client dist path, token durations, shutdown timeout
    ├── lib/                    Vendored third-party-style helpers with no external dependency
    ├── middleware/              Cross-cutting Express middleware
    │   ├── authenticate.js        Token check + sliding refresh, attaches req.user
    │   └── rateLimit.js           Per-route rate limiting (login vs authenticated routes)
    ├── services/                Business logic between routers and data managers
    │   └── userService.js         Response serialization, score validation
    ├── data/                    Data access layer ("model" managers)
    │   ├── db.js                  In-memory store wrapper, gzip load/save
    │   ├── accounts.js            Accounts, authentication, session tokens
    │   ├── entries.js             Global entry catalog
    │   └── user.js                Per-user scores
    └── routers/                 Controller layer (Express routes)
        ├── userRoutes.js          /user/*
        └── quizRoutes.js          /quiz/*

dist/                          Generated by `npm run build` (or `npm install`'s postinstall hook), gitignored
└── client/                    Vite build output, served statically by Express (src/server/ runs as-is, not built)
```

### 2.3 Architectural pattern

Layered structure close to a lightweight MVC, typical of an Express application:

- **Routers**: controller layer, define endpoints and apply the authentication middleware.
- **Middleware**: cross-cutting concerns (currently authentication) live in their own module, not re-exported from a router.
- **Services**: business logic shared across routers (response serialization, request validation) rather than duplicated in each route handler.
- **Data managers**: model/DAO layer, one singleton per entity (accounts, entries, users), each encapsulating its own logic. Mutations stay in memory only; persistence to disk happens exclusively through an explicit `save()`, called once during graceful shutdown after the HTTP server has fully closed.
- **DB**: low-level access layer, a single shared singleton, with a key-namespacing system (dot notation) to organize data within one in-memory object.

No server-side view engine. The client is a **React SPA built with Vite**, routed with `react-router`. Authentication and API access are centralized in custom hooks (`hooks/useAuth.js`, `hooks/useApi.js`) rather than spread across page scripts.

Routes do not follow a strict REST CRUD convention but stay consistent with HTTP verbs (GET for reads, POST for login/actions, PUT for updating a resource).

### 2.4 Authentication and security

- Password hashed with SHA-512 client-side (salt = login, always lowercased regardless of the case typed, + fixed constant), then re-hashed server-side with `scrypt` using a random salt generated per account (16 bytes), stored in the database but never transmitted by any API. Password comparison uses a constant-time check (`timingSafeEqual`).
- Session tokens generated as UUID v4. Each token is bound to the IP address it was issued/refreshed on: `check_token` fails if a valid token is presented from a different IP. Neither the raw token nor the IP are kept in memory — only `sha256(token + '|' + ip)` is stored as the lookup key, so a memory dump exposes nothing directly reusable. This binding, like the tokens themselves, lives **in server memory only** (never persisted): lost on server restart, which logs out every user.
- Absolute token expiration after 16 hours, automatic refresh if the token is older than 1 hour (sliding session): every authenticated request returns a refreshed token in the response header, which the client persists. If the caller already validated the current token on this request, refreshing returns it as-is instead of minting a new one — no need to keep a raw token in memory just to "give it back" later.
- A shared authentication middleware protects the routes under `/user/*` and `/quiz/*`, returning 401 if the token is missing, invalid, or bound to a different IP.
- Rate limiting (`express-rate-limit`, `src/server/middleware/rateLimit.js`): `POST /login` is limited to 5 requests/minute keyed by IP; `/user/*` and `/quiz/*` are limited to 60 requests/minute keyed by the authenticated username (falls back to IP if unavailable). Exceeding the limit returns `429` with a `Retry-After` header.
- These durations, along with the port, certificate paths, database path, and client dist path, are centralized in `src/server/config/config.js` and overridable via environment variables.
- HTTPS is the default. If `--http` is passed on the command line, the server starts in plain HTTP mode and `CERT_KEY_PATH`/`CERT_CERT_PATH` are never read, whether they are set correctly or not. Without `--http`, if either certificate file is missing or unreadable, the server logs an error and exits (code 1) rather than starting without transport encryption — there is no silent fallback.

### 2.5 Data persistence

A single in-memory JSON object acts as the database, organized into three key namespaces:

- Password hash and salt per account.
- Global entry catalog (shared across all users), with an auto-incremented integer id.
- Manual scores per user and per entry.

Data managers only mutate this in-memory object through their own `save()` method — no per-mutation disk write. The object is loaded from disk on startup and flushed to disk once, as a whole, during graceful shutdown:

- On load: the file is read, decompressed with gzip (Node's built-in `zlib`), then parsed as JSON. A missing file starts the server with an empty database.
- On save: the in-memory object is serialized to JSON, then gzip-compressed, then written to a single file (path configurable via `CONFIG.DB_PATH`).

### 2.6 Server routes

| Method | Route | Authenticated | Role |
|---|---|---|---|
| GET | `/` | no | Serves the React app's `index.html` (`dist/client/index.html`) |
| GET | `/favicon.ico` | no | Serves the site icon (file currently missing) |
| GET | `/*` (static) | no | Serves the compiled client bundle (`dist/client/`) |
| POST | `/login` | no (rate-limited by IP) | Login, account creation, or token revalidation (3 branches depending on the request content) |
| GET | `/user/me` | yes | Returns the current user's data |
| PUT | `/user/entry` | yes | Creates or updates an entry's manual score |
| POST | `/quiz/dual` | yes | Receives a duel vote (not processed yet) |
| ALL | catch-all | no | 404, redirects to `/` |

### 2.7 Client-server communication

- Native `fetch` API, centralized in `hooks/useApi.js` (`apiGet`/`apiPost`/`apiPut`): automatic injection of the token in the `Authorization` header, JSON serialization of the request body, capture and persistence of the refreshed token returned by the server.
- The token is transmitted exclusively through a custom HTTP header, no cookie or Express session.
- Exchange format: JSON for application routes, form-urlencoded for login.
- In development, `vite.config.js` proxies `/login`, `/user`, and `/quiz` from the Vite dev server to the Express server (`npm run dev` starts both, via `concurrently`).

### 2.8 Automated tests

Unit tests live under `test/`, mirroring the `src/server/` structure, using Node's built-in test runner (`node --test`, `node:assert/strict`) — no external test framework dependency. They cover the data layer (`db.js`, `accounts.js`, `entries.js`, `user.js`), including full save/reload round-trips through the gzip-compressed file. Temporary test database files are cleaned up automatically after each successful test, and any leftover file from a previous interrupted run is removed before the suite starts.

## 3. Points of attention

1. `POST /quiz/dual` is a functional stub: the vote is received but no data is persisted or recomputed. Feature in progress, not delivered.
2. Elements absent from the repository: the site icon (`Nanking.ico`), and the `cert/` folder containing the HTTPS certificate (`server.key`/`server.cert`, intentionally excluded from version control). Required unless the server is started with `--http` (development only).
3. The home page's stylesheet (`HomePage.css`) is currently empty.
4. Session tokens (and their IP binding) are kept in memory only (not persisted), so a server restart logs out every user.
5. `npm install` runs the client build automatically (`postinstall`), which requires no certificate and does not start the server. `npm run serve` and `npm run dev:https` require `cert/` to exist locally; `npm run dev` and `npm run dev:http` do not (they start the server with `--http`).
6. Serverless-version features not yet ported: MyAnimeList/Jikan import, tags/categories, score computation through transitive vote propagation (see [Serverless.md](Serverless.md)).
7. Possible future migration to `express-session` (see [README.md](../README.md) TODO) is unaffected by this React migration — the client-side impact described there (`hooks/useAuth.js`, `hooks/useApi.js`) still applies to the current codebase.
