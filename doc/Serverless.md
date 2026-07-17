# Nanking — Serverless version

## Scope

Historical version (obsolete but functional) of Nanking, runnable as a plain static HTML page in a browser, with no backend. Corresponds to the state of the repository prior to commit `9c38d94`, which introduced the Node/Express backend.

Files involved: [index.html](../index.html), [scripts/](../scripts), [styles/](../styles), [pict/](../pict).

## 1. Application description and implemented features

Nanking is a tool for **ranking entries through successive duel comparisons**, on the principle of a progressive all-against-all tournament, entirely client-side.

### 1.1 Pairwise voting

Main screen: a table with two cells (`#a1` / `#a2`), each showing the image and name of an entry to compare.

Available voting actions:
- **`^ Choose`** / **`Choose ^`**: preference for the left or right entry.
- **`No Best`**: tie between the two entries.
- **`- Skip -`**: skips the pair without voting.

The next pair is chosen by an algorithm (`pick2()`) that prioritizes the entry voted on least recently, then selects a second candidate maximizing the new information brought by the comparison (avoids re-voting on pairs already known directly or indirectly).

### 1.2 Entry management

- **Add** a new entry by name (input field + `Add` button).
- **Edit** via a dedicated dialog: renaming (with uniqueness check), managing a list of images (add by URL with load test, removal), full entry deletion (with confirmation, purging associated votes).
- Each entry carries: a unique code, a name, a list of images, a set of tags (category → values, e.g. genres, year, type), and the date of its last vote.

### 1.3 Ranking

Ranking dialog accessible from the `Ranking` button, offering:
- The ranking of **entries**, or the aggregated ranking by **tag** of a chosen category (e.g. ranking genres against each other).
- A filtering slider by vote-completion rate, with a small distribution chart of entries.
- For each ranking row: rank, progression/regression indicator relative to the previous ranking, name, access to editing, and a 4-segment score bar representing the score's confidence interval (lower/upper bound), with the central score shown as a percentage.

### 1.4 Save, export, import

- **Save progress / Load progress**: full state serialization (entries, tags, votes) to JSON, LZW-compressed, exported as a `save.lzw` file; symmetric import with format version check.
- **Reset**: full reset after confirmation.
- **Export Votes**: TSV export of scores and vote counts per entry, for external analysis purposes.
- **Export Entries / Import Entries**: JSON export/import of the entry list alone (name, images, tags), without votes, allowing an entry list to be shared or pre-filled.

No `localStorage` is used: state only survives through manual file export/import.

## 2. Technical architecture

### 2.1 General approach

**100% static front-end** application, no framework (no React/Vue/Angular), no bundler or ES modules: global scripts loaded sequentially via plain `<script>` tags. Application state entirely in memory, persistence only through file export/import. No network API of its own, except for the optional calls to Jikan/MAL for data import.

### 2.2 External dependencies

| Dependency | Usage |
|---|---|
| jQuery 3.7.1 (CDN) | DOM manipulation, event handling |
| jQuery UI 1.14.0 (CDN) | Modal dialogs (entry editing, ranking), filter slider |
| `nbset.js` (natngs.github.io) | Compact encoding of number sets (bitsets) as printable ASCII, to compress vote/tag lists |
| `lzw.js` (natngs.github.io) | LZW compression of the full save file |

### 2.3 Script organization

Load order (reflects the dependencies): `polyfill.js` → `save.js` → `voteSystem.js` → `score.js` → `main.js`.

| File | Role |
|---|---|
| `scripts/polyfill.js` | `Array.prototype` extensions used throughout the code (deduplication, intersection, fast swap-removal, etc.) |
| `scripts/voteSystem.js` | Central data model: `VoteSystem` (vote matrix, direct/indirect vote computation), `EntryList`, `Entry` |
| `scripts/score.js` | `ScoreSystem`: score computation (optimistic/pessimistic bounds, central score) per entry and per tag |
| `scripts/main.js` | UI controller: orchestrates `VoteSystem`/`ScoreSystem`, handles display, pair selection, ranking |
| `scripts/save.js` | File persistence: export/import (LZW), TSV/JSON export, reset |
| `scripts/JikanImport.js` / `scripts/MALImport.js` | MyAnimeList list import (two competing implementations, not currently loaded) |

### 2.4 Voting and scoring system

Neither Elo nor TrueSkill: a custom system of **pairwise comparisons with transitive propagation**.

- Each vote is a directional triplet (winner / tie / loser) between two entries, stored once per unordered pair.
- A transitive closure algorithm infers, by iterating until stable, implicit preference relations not explicitly voted on (if A loses to B and beats C, then B is inferred to be better than C), reducing the number of comparisons needed for a consistent ranking.
- Each entry's final score is a win/tie/loss ratio normalized by the total number of possible confrontations, expressed as a confidence interval (optimistic/pessimistic bound depending on votes not yet cast); the displayed score is the average of both bounds. Entries with few votes show a wider interval.
- The same mechanism is reused to rank tags/categories against each other (e.g. genre preference), through aggregation of tag differences between voted entry pairs.

### 2.5 Persistence

No `localStorage`. Three data output mechanisms:
1. In-memory state, lost when the tab is closed.
2. Manual export/import of an LZW-compressed text file (`save.lzw`), covering the entire state, with additional compression of ID sets via NB_SET.
3. Secondary exports for analysis/sharing purposes (TSV of scores, JSON of the entry list without votes), the latter being re-importable as a merge.

## 3. Points of attention

- `MALImport.js` and `JikanImport.js` define the same global function (`importMALuserData`): they cannot be loaded simultaneously without a naming conflict.
- `styles/main.css` references `pen.svg` and `cross.svg` (image edit/delete icons) which do not exist in `pict/`: these buttons display without a visible icon.
- Versioned save format (`v: 3`): any file with a different version is rejected on import with an explicit error message.
