# TODO List

- Fix that React-select (tag picker, new entry picker) behavior (tests show often fails to compute/display the suggestions; clears itself when click on already inputed text; ...), and align the confirm button next to it (even try to make the + button with white background such as it looks like to be part of the picker) => Maybe the solution is to create my own picker with suggestions
- Progressively rework the data services (`entryService.js`, `tagService.js`, `userService.js`, `scoresComputerService.js`) to actually use SQLite's relational model (joins, indexes, `WHERE` filtering) instead of loading everything into plain JS objects/arrays at startup and working in memory - the SQLite migration (see README's Configuration > Database) only replaced the storage backend so far, none of the query/computation logic changed
- Improve dual picker (reduce chance to pick already compared entries, or transitively compared ones, increase chance to pick entries with low number of dual aleady done with them, increased chance to pick entries with only winning duals)
- Display on authenticated users' entry pages, the tree of what pushes their scores up or down (all the duals and the related scores)
- Create a category of tags "MetaTags", that can have only MetaTags as parents, and cannot have scores (only serve to group subTags or entries)
- Create a generic item object, and all Entries, Tags and Metatags inherit it (that seems possible, and so is logic to do)
- Allow users to have a personal display name for entries (that only show for them), with a button to reset to default name
- Create multiple "Schemas". Every schema has its own items and tags, with no relation to other schemas. For example a music schema, a manga schema, a TV show schema, a book schema, a restaurants schema... all in one site !! May work as a Meta-Metatag, reflexion to be done...
- Share filtered user table: Make public link /user/usename filtrable with query params to filter/sort the content (for example ?hasTag=french to only show french items from the username list)
- Proper mobile dispay mode

## Suggestions

Improvement ideas for the existing codebase - performance and maintainability only,
no new features. Not prioritized against the [TODO List](#todo-list) above; both are
candidates for future work.

### Server (`src/server/`)

**Performance**
- `scoresComputerService.js`'s `launchComputation` recomputes every user's scores on
  every cycle (every `SCORE_COMPUTE_INTERVAL`, 3s by default), even users with no new
  activity since the last cycle. A "dirty" flag set by `didQuiz`/`removeQuiz` would let
  the cycle skip users with nothing to recompute. => Still sometime would need to
  recompute even non-dirty users (less often though) as user scores depend a little on
  global score

**Maintainability**

- `entryService.js` and `tagService.js` duplicate the same
  find-by-id/validate/conflict/save shape for `renameEntry`/`renameTag`. A shared
  helper (e.g. `renameNamedResource(getById, getByNameIgnoreCase, save, id, newName)`)
  would remove the duplication and keep the `'not_found'|'invalid'|'conflict'|'ok'`
  contract in one place instead of two.
- `quizRoutes.js` duplicates the same "recompute until stable" loop
  (`for(...; totalUpdate > 0.005; ...) totalUpdate = await computeUserScores(...)`) in
  both the `POST /{*type}` and `DELETE /{*type}` handlers. Worth extracting into a
  single `recomputeUntilStable(sqlite, user)` in `scoresComputerService.js`. => En
  vérifiant ce point : `computeUserScores` ne fait actuellement aucun `return`, donc
  `totalUpdate` vaut toujours `undefined` et la boucle s'arrête après une seule
  itération (`undefined > 0.005` est `false`) au lieu de tourner jusqu'à
  stabilisation. À corriger en même temps que l'extraction (faire retourner à
  `computeUserScores` la variation totale des scores).

### Client (`src/client/`)

**Performance**

- `GlobalScoresPanel` and `EntriesPanel` are both mounted at once on the home page for
  an authenticated user (`MainPage.jsx`), each running its own independent 30s polling
  interval via `usePaginatedList`'s `refreshIntervalMs`. Two uncoordinated requests
  fire every 30s with no shared scheduling. Create a shared data collection system to
  share the refreshes for every component (for example, a component calling a manual
  refresh, like PUT quiz, may refresh the global refresh timeout such as it does not
  triggers too soon for nothing)
- `usePaginatedList`'s `fetchPage` has no `try/catch`: a failed request (including
  during background polling) becomes an unhandled promise rejection, silently - none
  of its consumers (`EntriesPanel`, `GlobalScoresPanel`, `ProfilePage`, `TagPage`'s
  entries list, `RecentVotesTable`) show an error or retry.

**Maintainability**

- Error handling is inconsistent across views: `TagPage`/`EntryPage`/
  `useRenamePrompt` show a proper error message on failure (`error` state + `<p
  role="alert">`), while `GlobalScoresPanel`/`ProfilePage` have none at all, and
  `RecentVotesTable.onDelete()` has no `catch` around its API calls (only a `finally`)
  - a failed delete fails silently. `DualQuiz.vote()` is similar (`try`/`finally`, no
  `catch`), though its sibling `fetchNewPair()` does have proper error handling and
  display. Worth standardizing on one pattern, starting with `usePaginatedList` itself.
- `EntryPage.jsx` (209 lines) owns rename, image upload (with its own validation),
  tag add/remove, score removal with confirmation, and auth-change resync - four
  separate `isX` booleans combined into one `isBusy`. Extracting at least the image
  upload logic into its own hook (mirroring `useRenamePrompt`) would shrink it.
- Minor accessibility gaps: `ScoreTable`'s sortable column headers (`<th onClick=...>`)
  aren't keyboard-focusable/-activatable (no `tabIndex`/`role="button"`/`onKeyDown`),
  unlike `PaginationControls` which already handles this; `UserMenu`'s trigger button
  has no `role`/`tabIndex`/`aria-expanded`/`aria-haspopup`.

### Extracting Score computation from node backend

Proposal under evaluation (not implemented, analysis only):

- Extract the whole score computation currently in `scoresComputerService.js` out of
  the Node.js app entirely.
- Remove the synchronous/instant score computation path (`quizRoutes.js`'s
  `recomputeAndPersist`, called on every `POST`/`DELETE /api/quiz/{*type}`).
- Add an `updated_at`-like timestamp on `accounts`, set whenever a user's scores get
  recomputed.
- Build an independent Python application that:
  - Connects to the SQLite database, loads current scores and all quiz/votes for every
    user into a Pandas DataFrame.
  - Computes scores using Pandas/Numpy matrix operations.
  - Writes back computed scores to user and entry (global) records, and updates the
    `updated_at` timestamp for changed users.
  - Purges the database (orphaned entities no longer linked to a user, newly-scored
    entities, etc.).
  - Keeps scores in memory between cycles, only re-reading quiz rows that changed
    since the last iteration at the start of the next one.
  - Waits 30s, then loops.
  - On kill during a DB write, finishes the in-flight write before exiting.
  - Keeps the last N (16 by default, configurable) global scores per entity in memory,
    computes a trend (current score higher/lower than N cycles ago), and stores it in
    the DB for a red/green arrow in the UI when the change is significant.
- The Node process spawns the Python process on startup, and sends it `SIGKILL` when
  the Node process stops.
- Stated long-term motivation: room for more advanced scoring later (e.g. estimating
  scores from similar users), and the option to move computation to a dedicated
  machine or a GPU-backed one.

**Advantages**

- **Language fit for the future roadmap.** Pandas/Numpy (and later scikit-learn/
  PyTorch for the "similar users" idea) are a much better fit than hand-rolled JS
  loops for matrix-style or ML-flavored score estimation. Doing this rewrite now, while
  the algorithm is still simple, is cheaper than doing it once the algorithm has grown.
- **Removes a bottleneck already flagged as a problem.** `launchComputation` currently
  recomputes every user and every entry every cycle with no dirty-tracking (see
  Performance note above) and runs on Node's single event loop, synchronously, via
  `node:sqlite`'s `DatabaseSync`. A vectorized Pandas/Numpy pass over the whole dataset
  is very likely faster than per-user/per-entry JS loops for any non-trivial data size,
  and moving it off the Node process removes its event-loop-blocking impact on
  request/response latency entirely.
- **Removing the synchronous HTTP-path computation simplifies `quizRoutes.js`.** No
  more "recompute until stable" loop duplicated across `POST`/`DELETE` handlers (also
  flagged above, and currently broken - `computeUserScores` has no `return`, so the
  loop never actually iterates). Vote endpoints become a plain write + fast response.
- **Decoupling to a separate process is a real path to independent scaling.** A
  separate OS process is what makes "move to a dedicated machine or add GPU" realistic
  later - it wouldn't be if computation stayed embedded in the Node request path.
- **Batch purge logic centralizes cleanup that is presumably scattered/missing today**
  (orphaned entries, stale rows) into one place that already has a full view of the
  data.

**Drawbacks**

- **Scores become eventually-consistent, and the UI has no way to represent that.**
  Today, voting is followed instantly by an updated score (synchronous path). With a
  30s Python cycle, a user who votes sees a stale score for up to ~30s (plus DB I/O
  time), yet the UI gives no feedback that a recompute is pending. This is a real UX
  regression unless the UI is also changed to show "recomputing..." or similar - which
  is scope not mentioned in the proposal.
- **Two runtimes, two dependency ecosystems, one codebase.** Introduces Python
  packaging (`requirements.txt`/`pyproject.toml`, a venv or lockfile), a second set of
  library versions to patch, and a second language for anyone maintaining scoring logic
  to know. Today's repo has zero Python footprint - this is a full new axis of
  operational surface (deployment, CI, dependency updates) for a project that currently
  ships as a single Node process.
- **Process supervision is undermined by the exact mechanism proposed.**
  `SIGKILL` (not `SIGTERM`) gives the Python process zero chance to run its own
  graceful-shutdown/cleanup code - which directly contradicts the proposal's own "wait
  for the in-flight write to finish before exiting" requirement. A killed process
  cannot choose to finish anything; it is possible only with `SIGTERM` + a handler, with
  `SIGKILL` reserved as a last-resort timeout fallback. As written, the two requirements
  are inconsistent. Beyond the signal choice: what restarts the Python process if it
  dies on its own (crash, unhandled exception) while Node stays up? What happens on
  `npm run dev`/hot-reload restarting Node repeatedly? None of this is specified.
- **The circular dependency between user scores and entry global scores doesn't go
  away, it just moves.** `computeGlobalScores` folds every user's contribution into
  each entry's `global_score`, which future user-score computations then read back.
  Splitting "read changed quiz rows only" from "recompute globally" needs the same
  careful sequencing in Python that today's single-process JS already has to get right
  - the proposal's "only re-read updated quiz at the start of next iteration" doesn't
  by itself solve recomputing global scores affected by unchanged users (same caveat
  already on record in the Performance note above).
- **Introduces distributed-system failure modes for a single-machine app.** DB
  contention between two independent writers (Node handling request writes, Python
  batch-writing scores/purging), partial-write visibility to Node while Python is mid
  cycle, and needing both processes to agree on schema/migrations. `node:sqlite`'s
  `DatabaseSync` being synchronous makes lock contention from a concurrent writer more
  likely to surface as latency spikes on the Node side.
- **The purge step is destructive and now lives outside the main application's
  control/tests.** Deleting "entities no longer linked to a user" from a second
  process, on its own timer, is a meaningful blast-radius increase compared to today
  where all writes go through one reviewed, tested codebase.
- **Testing gets harder.** Today's integration tests (`fixtureDb.js`) assume scores in
  `user_entry` are already correct at fixture-insert time - "never recomputed on read".
  A cross-process async pipeline means integration tests either need to wait/poll for
  the Python cycle, run it inline for tests (defeating the point of decoupling), or
  fixtures need to keep faking pre-computed scores forever - not free either way.
- **Scale of the proposal versus the problem it solves today.** The project has no
  documented volume/performance issue yet (no metrics, no reported slowness) - the
  motivation is explicitly "future" ML-flavored scoring and GPU/dedicated-machine
  scaling, not a current pain point. This is a large, cross-language architectural
  change made ahead of the need it's justified by.

**Smaller-step alternative worth considering instead:** keep computation in Node but
apply the dirty-flag optimization already on record above, drop the synchronous
HTTP-path recompute in favor of the existing batch cycle (shortened if needed), and add
the `updated_at` timestamp - this captures most of the "instant computation" and
"correctness" wins without the cross-language/process-supervision cost. The Python/
Pandas rewrite would still make sense later, specifically when the scoring algorithm
itself becomes matrix/ML-shaped (the "similar users" idea) rather than for the current
simple weighted-average logic.
