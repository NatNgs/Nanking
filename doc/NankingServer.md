# Nanking — NankingServer (new implementation)

## Scope

New implementation of Nanking in progress, based on a Node.js/Express backend with in-memory persistence (gzip-compressed on disk) and a homemade jQuery SPA front-end.

Files involved: [src/client/](../src/client), [src/server/](../src/server), [package.json](../package.json).

## 1. Application description and implemented features

### 1.1 Authentication

Home page (`/`) offering login and account creation.

- The password is hashed client-side using **SHA-512** (jsSHA library), salted with the login (lowercase) and a fixed constant, before any network transmission.
- On the server, the received hash is hashed again with a per-account random salt (`scrypt`), which is never transmitted by any API and is stored only in the database. The client-side hash therefore never reaches the server or the database in a directly reusable form.
- Account creation: sends the login and the client-side hash with a "new account" flag.
- Login: the server responds with a session token sent in a dedicated HTTP header.
- Automatic reconnection: the token is kept in `localStorage` and revalidated/refreshed on every authenticated request (sliding session).
- Logout: removes the local token and reloads the page.
- Login constraints: restricted format (lowercase letters, digits, `_.-`, 4 to 20 characters), checked both client-side and server-side.

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
- **HTTP server**: Express 5, served over **HTTPS** (certificates required in a `cert/` folder, not included in the repository).
- **Middleware**: body-parser (`urlencoded` for login, `json` for application routes).
- **Persistence**: in-memory JSON object, gzip-compressed on disk as a single file (see [Persistence](#25-data-persistence)).
- **Session identifiers**: `uuid` v4.
- **Entry point**: `src/server/server.js`, launched via `npm run serve`.
- Port 8053 by default, overridable through configuration; displays available LAN IPs on startup and handles graceful shutdown (SIGTERM/SIGINT/SIGHUP).

### 2.2 Folder organization

```
src/
├── client/                    Static front-end (served via express.static)
│   ├── assets/                Images (default placeholder)
│   ├── pages/home/             Unauthenticated home page (login/register)
│   ├── parts/                  HTML fragments loaded dynamically as an SPA
│   │   ├── main/                Entry list and scores
│   │   └── dual/                Voting duel frame
│   └── scripts/                Shared JS scripts (SPA routing, quiz, score formatting)
└── server/
    ├── server.js               Entry point, Express configuration, public routes, startup/shutdown
    ├── config/                  Centralized configuration
    │   └── config.js              Port, certificate paths, DB path, token durations, shutdown timeout
    ├── lib/                    Vendored third-party-style helpers with no external dependency
    ├── middleware/              Cross-cutting Express middleware
    │   └── authenticate.js        Token check + sliding refresh, attaches req.user
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
```

### 2.3 Architectural pattern

Layered structure close to a lightweight MVC, typical of an Express application:

- **Routers**: controller layer, define endpoints and apply the authentication middleware.
- **Middleware**: cross-cutting concerns (currently authentication) live in their own module, not re-exported from a router.
- **Services**: business logic shared across routers (response serialization, request validation) rather than duplicated in each route handler.
- **Data managers**: model/DAO layer, one singleton per entity (accounts, entries, users), each encapsulating its own logic. Mutations stay in memory only; persistence to disk happens exclusively through an explicit `save()`, called once during graceful shutdown after the HTTP server has fully closed.
- **DB**: low-level access layer, a single shared singleton, with a key-namespacing system (dot notation) to organize data within one in-memory object.

No server-side view engine. The client is a **minimal homemade jQuery SPA**: HTML fragments are loaded dynamically via AJAX and injected into the page, with no bundler or build step.

Routes do not follow a strict REST CRUD convention but stay consistent with HTTP verbs (GET for reads, POST for login/actions, PUT for updating a resource).

### 2.4 Authentication and security

- Password hashed with SHA-512 client-side (salt = login + fixed constant), then re-hashed server-side with `scrypt` using a random salt generated per account (16 bytes), stored in the database but never transmitted by any API. Password comparison uses a constant-time check (`timingSafeEqual`).
- Session tokens generated as UUID v4, kept **in server memory only** (not persisted to the database): lost on server restart, which logs out every user.
- Absolute token expiration after 16 hours, automatic refresh if the token is older than 1 hour (sliding session): every authenticated request returns a refreshed token in the response header, which the client persists.
- A shared authentication middleware protects the routes under `/user/*` and `/quiz/*`, returning 401 if the token is missing or invalid.
- These durations, along with the port, certificate paths, and database path, are centralized in `src/server/config/config.js` and overridable via environment variables.

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
| GET | `/` | no | Serves the home page |
| GET | `/favicon.ico` | no | Serves the site icon (file currently missing) |
| GET | `/*` (static) | no | Serves the client's assets, fragments, and scripts |
| POST | `/login` | no | Login, account creation, or token revalidation (3 branches depending on the request content) |
| GET | `/user/me` | yes | Returns the current user's data |
| PUT | `/user/entry` | yes | Creates or updates an entry's manual score |
| POST | `/quiz/dual` | yes | Receives a duel vote (not processed yet) |
| ALL | catch-all | no | 404, redirects to the home page |

### 2.7 Client-server communication

- AJAX via jQuery, no native fetch.
- A single client module centralizes SPA routing and API calls: automatic injection of the token in the authorization header, JSON serialization of the request body, capture and persistence of the refreshed token returned by the server.
- The token is transmitted exclusively through a custom HTTP header, no cookie or Express session.
- Exchange format: JSON for application routes, form-urlencoded for login.

### 2.8 Automated tests

Unit tests live under `test/`, mirroring the `src/server/` structure, using Node's built-in test runner (`node --test`, `node:assert/strict`) — no external test framework dependency. They cover the data layer (`db.js`, `accounts.js`, `entries.js`, `user.js`), including full save/reload round-trips through the gzip-compressed file. Temporary test database files are cleaned up automatically after each successful test, and any leftover file from a previous interrupted run is removed before the suite starts.

## 3. Points of attention

1. `POST /quiz/dual` is a functional stub: the vote is received but no data is persisted or recomputed. Feature in progress, not delivered.
2. Elements required at runtime but absent from the repository: the site icon (`Nanking.ico`) and the `cert/` folder containing the HTTPS certificate (`server.key`/`server.cert`, intentionally excluded from version control — it must be generated locally by whoever operates the server).
3. The home page's stylesheet is currently empty.
4. Session tokens are kept in memory only (not persisted), so a server restart logs out every user.
5. No rate-limiting yet on any endpoint (see the TODO and implementation notes in [README.md](../README.md)).
6. Serverless-version features not yet ported: MyAnimeList/Jikan import, tags/categories, score computation through transitive vote propagation (see [Serverless.md](Serverless.md)).
