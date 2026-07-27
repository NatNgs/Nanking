# TODO List

- Fix that React-select (tag picker, new entry picker) behavior (tests show often fails to compute/display the suggestions; clears itself when click on already inputed text; ...), and align the confirm button next to it (even try to make the + button with white background such as it looks like to be part of the picker) => Maybe the solution is to create my own picker with suggestions
- Progressively rework the data services (`entryService.js`, `tagService.js`, `userService.js`, `scoresComputerService.js`) to actually use SQLite's relational model (joins, indexes, `WHERE` filtering) instead of loading everything into plain JS objects/arrays at startup and working in memory - the SQLite migration (see README's Configuration > Database) only replaced the storage backend so far, none of the query/computation logic changed
- Improve dual picker (reduce chance to pick already compared entries, or transitively compared ones, increase chance to pick entries with low number of dual aleady done with them, increased chance to pick entries with only winning duals)
- Possibility to manually chose what entry to dual (either no manual selection => automatic, or one selected and other automatic, or both manual)
- Display on authenticated users' entry pages, the tree of what pushes their scores up or down (all the duals and the related scores)
- Create a category of tags "MetaTags", that can have only MetaTags as parents, and cannot have scores (only serve to group subTags or entries)
- Create a generic item object, and all Entries, Tags and Metatags inherit it (that seems possible, and so is logic to do)
- When real database: Allow users to have a personal display name for entries (that only show for them), with a button to reset to default name
- When real database: Create multiple "Sections". Every section has its own items and tags, with no relation to other sections. For example a music section, a manga section, a TV show section, a book section, a restaurants section... all in one site !! May work as a Meta-Metatag, reflexion to be done...
- Share filtered user table: Make public link /user/usename filtrable with query params to filter/sort the content (for example ?hasTag=french to only show french items from the username list)
- Proper mobile dispay mode

## Rate-limiting

Implemented via `express-rate-limit` (`src/server/middleware/rateLimit.js`), with four
distinct limiters (defaults below, all overridable via `rateLimit.<name>.limit` /
`.windowSeconds` - see README's [Configuration](README.md#configuration)):

| Limiter | Default | Keyed by | Applies to |
|---|---|---|---|
| `loginLimiter` | 6 req / 60s | IP | `POST /api/login` - slows down brute-force attempts on account passwords |
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

# Suggestions

Improvement ideas for the existing codebase - performance and maintainability only,
no new features. Not prioritized against the [TODO List](#todo-list) above; both are
candidates for future work.

## Server (`src/server/`)

**Performance**
- `scoresComputerService.js`: `computeUserTagScores`/`computeGlobalTagScores` re-scan
  every entry for every tag on every cycle (O(tags × entries)), and `tags.js`'s
  `getDirectChildren` is recomputed from scratch each time it's called in these loops
  (including from `topologicalOrder`, already O(tags²) on its own). A once-per-cycle
  `tagId → entryIds` / `tagId → children` index, built once and reused, would remove
  most of this redundant work.
- `launchComputation` recomputes every user's scores on every cycle (every
  `scoreComputeInterval`, 3s by default), even users with no new activity since the
  last cycle. A "dirty" flag set by `didQuiz`/`removeQuiz` would let the cycle skip
  users with nothing to recompute. => Still sometime would need to recompute even non-dirty users (less often though) as user scores depend a little on global score
- `entries.js`/`tags.js`: name/label lookups (`getEntryByName`, `getTagByLabel`, their
  `IgnoreCase` variants) scan the full collection linearly on every call (creation,
  rename-conflict check, ...). Maintaining a `name → entry` / `label → tag` side map
  would make these O(1) instead of O(n). => Will be improved when going to true DB

**Maintainability**

- `entryService.js` and `tagService.js` duplicate the same
  find-by-name/validate/conflict/save shape for `renameEntry`/`renameTag`. A shared
  helper (e.g. `renameNamedResource(manager, id, newName, {...})`) would remove the
  duplication and keep the `'not_found'|'invalid'|'conflict'|'ok'` contract in one
  place instead of two. => Will be improved by creating common parent class above Entry and Tag
- `quizRoutes.js` duplicates the same "recompute until stable" loop
  (`for(...) totalUpdate = computeUserScores(user)`) in both the `POST` and `DELETE`
  handlers. Worth extracting into a single `recomputeUntilStable(user)` in
  `scoresComputerService.js`.
- `tags.js`'s `save()` silently prunes tags no longer referenced by any entry, as a
  side effect of persistence (`_isUsedByAnyEntry`): That is expected, but not documented and maybe confusing. Extracting it into a clearly
  named `pruneOrphanTags()` would make it discoverable and testable on its own.

## Client (`src/client/`)

**Performance**

- `GlobalScoresPanel` and `EntriesPanel` are both mounted at once on the home page for
  an authenticated user, each running its own independent 30s polling interval via
  `usePaginatedList`'s `refreshIntervalMs`. Two uncoordinated requests fire every 30s
  with no shared scheduling. Create a shared data collection system to share the refreshes for every component (for example, a component calling a manual refresh, like PUT quiz, may refresh the global refresh timeout such as it does not triggers too soon for nothing)
- `usePaginatedList`'s `fetchPage` has no `try/catch`: a failed request (including
  during background polling) becomes an unhandled promise rejection, silently - none
  of its consumers (`EntriesPanel`, `GlobalScoresPanel`, `ProfilePage`, `TagPage`'s
  entries list, `RecentVotesTable`) show an error or retry.

**Maintainability**

- Error handling is inconsistent across views: `TagPage`/`EntryPage`/
  `useRenamePrompt` show a proper error message on failure, while
  `GlobalScoresPanel`/`ProfilePage` have none at all, and `DualQuiz.vote()`/
  `RecentVotesTable.onDelete()` have no `try/catch` around their API calls - a failed
  vote or delete fails silently. Worth standardizing on one pattern (e.g. an `error`
  state + `<p role="alert">`), starting with `usePaginatedList` itself.
- Mix French and English to fix: Remove all french and replace to English. For later, implement
  transaltion module and create both languages with a settings switch (or in url with ?lang=fr)
- `EntryPage.jsx` (~190 lines) owns rename, image upload (with its own validation),
  tag add/remove, score removal with confirmation, and auth-change resync - five
  separate `isX` booleans combined into one `isBusy`. Extracting at least the image
  upload logic into its own hook (mirroring `useRenamePrompt`) would shrink it.
- Minor accessibility gaps: `ScoreTable`'s sortable column headers (`<th onClick=...>`)
  aren't keyboard-focusable/-activatable (no `tabIndex`/`role="button"`/`onKeyDown`),
  unlike `PaginationControls` which already handles this; `UserMenu`'s trigger button
  has no `aria-expanded`/`aria-haspopup`.
