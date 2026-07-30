# TODO List

## Keep in mind

- Progressively rework the data services (`entryService.js`, `tagService.js`, `userService.js`, `scoresComputerService.js`) to actually use SQLite's relational model (joins, indexes, `WHERE` filtering) instead of loading everything into plain JS objects/arrays at startup and working in memory - the SQLite migration (see README's Configuration > Database) only replaced the storage backend so far, none of the query/computation logic changed

## Ideas

- Fix that React-select (tag picker, new entry picker) behavior (tests show often fails to compute/display the suggestions; clears itself when click on already inputed text; ...), and align the confirm button next to it (even try to make the + button with white background such as it looks like to be part of the picker) => Maybe the solution is to create my own picker with suggestions
- Display on authenticated users' entry pages, the tree of what pushes their scores up or down (all the duals and the related scores)
- Create a category of tags "MetaTags", that can have only MetaTags as parents, and cannot have scores (only serve to group subTags or entries)
- Create a generic item object, and all Entries, Tags and Metatags inherit it (that seems possible, and so is logic to do)
- Allow users to have a personal display name for entries (that only show for them), with a button to reset to default name
	- After that, rename button will only apply to current user (no more renaming the whole entity) -- Admin still have a 'rename for everybody' button to change the overall entity name
	- Also does not allow non-admin to modify entity image if any other user than them have any quiz completed with this entity (only allow for self created entities) -- Admin always have the right to
- Share filtered user table: Make public link /user/usename filtrable with query params to filter/sort the content (for example ?hasTag=french to only show french items from the username list)
- Ranking updates: Record the previous x scores of every entry. Display an arrow (green up/red down/none) if the entry score changed significantly (to be defined) in the previous 24h (to be defined too). Allow to sort global score page by this value (how much does its score increased since 24h ago). Mark new entries (less than 24h of data) as 'New', and sorted like "Increased score by 2" (no score can increase by more than 1, this make them sort first when ordered by score change DESC)
- Proper mobile dispay mode
- Administration options
	- Merging entities - on entries page: have an entry picker, and 'Merge this into other' and 'Merge other into this': Remove the entry (either the other or this one depending on the button clicked), find all users quiz on it and replace the removed by the other entity (If conflicts, remove the quiz of the removed entity and keep the one of the remaining one)
	- Removing entity - add a Remove entity button, that does remove the entity fully, with all the quiz and scores of every user
	- Modify entity Id
- Create a log of actions, registering who did what (specifically for admin purposes, and for the next ideas, to trace moderation)
- Tags, rename, image suggestions by users: Work a way to make that non-admin users could send suggestions to change display name, tags and image of an entity, and also rename a tag or modify its related tags parents/children; sending the suggestion to moderation where admins can accept or deny them. Users may see others suggestions and like/dislike them (the like/dislike count would be shown to the admins only to help them)
- Permissions management: Create some real permissions management, to help for example ban a user for some permissions for some time if needed ("this user cannot do suggestions for the next 7 days", "this user is not allowed to login until next year" for example) - Admin page of the user will display a form to modify a specific user permissions.
	- Create a moderator role (or multiple?), that can see the different admin options. Only admins can access the permission management window. Moderators may access to accept/deny suggestions, rename/merge items, change images, etc.
- Add a space for comments under tags/entries. Every logged-in user can set their message (only one per user), that other users will se on the entry page. Carefulness required (should absolutely sanitize what user write, no html/javascript should ever be interpreted)

## Feature: Multiple topics

From a user's point of view, this feature is called "Topics" - internally it maps
to what earlier notes called "Schemas". Each topic has its own entries and tags,
with no relation to other topics (a "books" topic, a "movies" topic, a "manga"
topic, ... all on the same site). Accounts stay shared across every topic - only
entities (entries, tags) and everything that depends on them (scores, quiz
history) are siloed per topic. Analysis below, not implemented yet.

### Server


**Implementation approach: not yet decided**

Two candidate data models are documented below. Only one will actually be
implemented - this is a comparison to inform that choice, not two parallel
features.

- **Schema mode**: one SQLite file per topic (same `CREATE TABLE` statements in
  each, covering `entries`/`tags`/`tag_parents`/`entry_tags`/`direct_quiz`/
  `dual_quiz`/`user_entry`/`id_sequences`), plus one additional, always-present
  `global` file holding everything that doesn't depend on a topic (`accounts`
  only, today). A request handles both the `global` file and the one active
  topic's file, attached together to the same connection via `ATTACH DATABASE
  'path' AS topicname`/`ATTACH DATABASE 'global.sqlite' AS global`, so tables
  are addressed as `topicname.entries`, `global.accounts`, etc. - the closest
  SQLite equivalent to Oracle's `SET SCHEMA` (SQLite has no native
  named-schema/namespace concept inside a single file, unlike Oracle/Postgres).
- **Key mode**: a single set of tables, shared by every topic, with a
  `topic_id` column added to every topic-dependent table to tell entities of
  different topics apart, backed by a new `topics` table (id, label) that
  `topic_id` is a foreign key to.

**Comparison**

| | Schema mode (`ATTACH DATABASE`) | Key mode (`topic_id` column) |
|---|---|---|
| Cross-topic data leak | Structurally impossible for topic-to-topic leaks - a connection only ever has the `global` file plus ONE topic's file attached at a time, never two topics' files simultaneously. Still requires picking the correct topic file to attach for the request (a routing bug, not a query bug), but there is no `WHERE`/join that could accidentally cross topic A into topic B's data the way a forgotten filter could in key mode. | Possible if a query forgets the `WHERE topic_id = ?` filter - relies on every one of ~40 repository functions enforcing it (see Main risk below). |
| Foreign keys | Not supported across attached databases (confirmed by SQLite's own docs: `REFERENCES otherdb.table` is a syntax error). `direct_quiz`/`dual_quiz`/`user_entry`'s `FOREIGN KEY ... REFERENCES entries(id)` stays intra-file, fine, since those tables live in the same per-topic file as `entries`. But `accounts` now lives in the separate `global` file by design, so `direct_quiz.username REFERENCES accounts(username) ON DELETE CASCADE` (today's actual FK) can no longer be expressed as a real constraint at all - `ON DELETE CASCADE` would have to be reimplemented in application code (already partly the case, see `removeUserReferencesToEntry`/`saveUser` in `userRepository.js`, but the DB-level safety net disappears, and it would now need to run once per topic file when an account is deleted). | Every existing FK (including `accounts` ↔ `direct_quiz`/`dual_quiz`/`user_entry`) stays exactly as-is, single-file, fully enforced by SQLite - `topic_id` itself is a proper FK to the new `topics` table too. |
| Transaction atomicity | Directly relevant here since every request now spans two files (`global` + the active topic) - e.g. `saveUser` writes to `global.accounts`-referencing rows and `topicname.direct_quiz`/`dual_quiz`/`user_entry` together. SQLite's own docs state multi-attached-database transactions are atomic only "assuming the main database is not `:memory:` and the journal_mode is not WAL" - a caveat to actively account for, not a given. | Always atomic (single file, standard SQLite transaction guarantees, no caveat). |
| Creating/deleting a topic | Create/delete one file - trivial, and a mistake is contained to that file. | Also trivial with the FK chain in place: creating a topic is one `INSERT` into `topics`; deleting one is one `DELETE FROM topics WHERE id = ?`, with every dependent row (`entries`, `tags`, and everything chained below them - `entry_tags`, `tag_parents`, `direct_quiz`, `dual_quiz`, `user_entry`) removed automatically via `ON DELETE CASCADE`, the same mechanism `accounts` deletion already relies on today (`sqliteDb.js`'s `direct_quiz`/`dual_quiz`/`user_entry` FKs). No manual per-table purge needed once the FKs are declared with cascade. |
| Repository code changes | Repository functions gain a `schemaName`/attached-alias parameter used to build the table reference (e.g. `` `${schemaName}.entries` ``) - still touches every topic-dependent query, but the parameter can't silently be "forgotten" as easily as a `WHERE` clause, since the table itself won't exist unqualified. | Every one of ~40 repository functions across `entriesRepository.js`, `tagsRepository.js`, `userRepository.js`, `userEntryRepository.js` gains a required `topicId` parameter, added to every `WHERE`/`INSERT`/index/composite key. |
| Connection/attach management overhead | New: `db.js`'s connection now always has the `global` file attached, plus whichever topic file the current request needs, attaching/detaching topic files as requests come in (well within SQLite's default cap of 10 simultaneously attached databases, `SQLITE_MAX_ATTACHED`, raisable up to 125 - two files at a time is nowhere near either limit) - a new piece of infrastructure that doesn't exist today. | None - `db.js` stays a single connection to a single file, exactly as today. |
| `node:sqlite` support | `ATTACH DATABASE` isn't exposed via a dedicated `DatabaseSync` method, but works as plain SQL through `db.exec(...)`/`db.prepare(...)`, same as every other statement today - no known Node-specific bugs found for it. | No new driver capability needed - already exactly what's used today. |
| Cross-topic id collisions | Can't happen - each topic is a separate file, ids are only ever unique within one file. | Handled by making `topic_id` part of the primary key (see Data model below) rather than relying on `id` alone staying globally unique - relevant since the same external entity (e.g. imported from MAL) could exist independently in two different topics under the same source id. |


**Data model**

Independent of which mode above is picked, these apply:

- Something acts as the source of truth for "does this topic exist" - a
  `topics` table (key mode) or the set of known topic files on disk (schema
  mode, alongside the always-present `global` file). Either way, a topic name
  must be lowercase, no symbols.
- `tag_parents`/`entry_tags` stay implicitly scoped in either mode (both their
  keys already reference rows of the same topic).
- In schema mode specifically: `accounts` (and anything else topic-independent)
  lives in the dedicated `global` file - logins/passwords/`is_admin` remain
  shared, one account works across every topic. Every other table
  (`entries`/`tags`/`tag_parents`/`entry_tags`/`direct_quiz`/`dual_quiz`/
  `user_entry`/`id_sequences`) is duplicated per topic file, unchanged
  otherwise.
- In key mode specifically:
  - New `topics` table (`id`, `label`) - the source of truth referenced above.
    `topic_id` becomes a proper foreign key to `topics(id)` everywhere it's
    used, rather than an unchecked string.
  - `topic_id` is added to `entries`, `tags`, `direct_quiz`, `dual_quiz`,
    `user_entry`. `accounts` stays untouched - logins/passwords/`is_admin`
    remain global, one account works across every topic.
  - `topic_id` is folded into the primary key of `entries` and `tags`, becoming
    `(topic_id, id)` instead of `id` alone - not just an added filter column.
    This matters specifically because an entry imported from an external
    source (e.g. MAL) could otherwise collide: the same source id imported
    independently into two different topics must be able to coexist as two
    distinct rows, which a bare `id TEXT PRIMARY KEY` couldn't guarantee
    (whether that same source id becomes the same `id` string in both topics,
    or two unrelated ids, either way the pair must stay unique, not the id
    alone).
  - Every foreign key that used to reference `entries(id)`/`tags(id)` alone
    (`entry_tags`, `tag_parents`, `direct_quiz.neg_id`/`pos_id`, `user_entry.
    entry_id`) must become a composite reference to `(topic_id, id)` instead -
    otherwise a `neg_id` could technically resolve to a row from a different
    topic than the one the request is scoped to. This is the main extra schema
    complexity key mode's composite-key requirement introduces beyond simply
    adding the column.
  - `direct_quiz`/`dual_quiz`/`user_entry`'s `topic_id` is technically
    derivable via a join on `entries` (an entry belongs to exactly one topic),
    but duplicating it directly avoids a join on every hot-path query
    (`getUserScores`, `loadUserQuiz`, ...) and lets `(username, topic_id)` be
    indexed directly for the per-topic user page.

**Score computation**

- Confirmed: scores are computed per topic, each topic fully independent from
  the others - a score only ever exists in the context of one particular topic.
- `computeUserScores`/`computeGlobalScores` take the topic to run on as a
  required parameter.
- The periodic automatic cycle (`scoresComputerService.launchComputation`) runs
  once per existing topic, one after another, before waiting the usual 30s and
  starting the next round over every topic again - not one interval per topic
  running concurrently.

**API routing**

- Every topic-dependent API route gains a `/:topic` path segment (e.g.
  `/api/books/quiz/dual`).
- Every topic-scoped API call systematically checks the requested topic exists
  first. An invalid topic is a 404. Once validated, the request proceeds against
  that topic; if the requested data doesn't make sense in that topic's context
  (e.g. an entry id that belongs to a different topic), that's a separate error
  raised at that point - never a silent cross-topic fallback.

**Main risk and its mitigation (key mode only)**

- This risk is specific to key mode - see the Comparison table above: schema
  mode makes cross-topic leaks structurally impossible by design.
- Ommitting `topic_id` from a `WHERE` clause would silently leak data across
  topics (e.g. `getAllEntriesWithScores` without a filter would list every
  entry of every topic). This is mitigated by the systematic existence check
  described above: every topic-scoped operation is only ever reached after its
  topic id has been validated against the `topics` table, and every repository
  function affected (~40 functions across `entriesRepository.js`,
  `tagsRepository.js`, `userRepository.js`, `userEntryRepository.js`) must take
  the validated `topicId` as a required parameter rather than defaulting to an
  unscoped query.

**Migration**

- On upgrade, existing data (created before topics existed) is migrated into a
  new "anime" topic - the exact process is importing from a SQLite database
  produced by the current (pre-topics) version of the app into whichever mode
  ends up chosen: copying the existing file as-is to become the "anime" topic's
  own file (schema mode), or importing every row with `topic_id = 'anime'`
  into the shared tables, ids becoming `(topic_id, id)` pairs (key mode).

### Client

**Routing**

- Every topic-dependent client route gains the same `/:topic` prefix as its API
  counterpart (e.g. `/books/quiz/dual`, `/movies/quiz/dual`).
- User-facing routes follow the same rule except the account page: `/user/toto`
  (no topic) shows toto's cross-topic overview (which topics they've
  participated in, with links to `/user/toto/books`, `/user/toto/movies`, ...),
  while `/user/toto/books` shows their scores scoped to that one topic. `/user/me`
  stays topic-less (account settings, never scoped).

**Pages**
- Rework the main page `/` that display the different available topics to navigate to them (even to unauthenticated users). Move the register button on the page, and copy the login button. Remove the Register button from the header (link is still available from login modal)
	- Topic main page `/{topicId}` correspond to current main page (with buttons to show global ranking, do direct or dual quiz, and right panel with user ranks on that topic)
		- Clic on 'Nanking' in the header from any page, redirects to `/{topicId}`. Exceptions are: on `/{topicId}` page or on pages without the topicId in the url, redirect to `/` page
- Add a topic selector in the header. Displays the current selected topic (according to url). On selection, update the page to the new selected topic
	- If the current page isn't available on others topics, display them grayed in the list (still selectable, but will redirect to the main page)
		- Example `/entity/{entityId}`, gray the topics that does not have entity with that entityId
	- Also sort topics such as grayed ones are below (after) non-grayed ones. Current topic always on the top of the list

## Improvement suggestions

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
  single `recomputeUntilStable(sqlite, user)` in `scoresComputerService.js`. => While
  checking this point: `computeUserScores` currently has no `return` at all, so
  `totalUpdate` is always `undefined` and the loop stops after a single
  iteration (`undefined > 0.005` is `false`) instead of running until
  stabilization. Fix this at the same time as the extraction (make
  `computeUserScores` return the total score variation).

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
