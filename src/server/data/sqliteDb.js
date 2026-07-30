import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const SCHEMA = `
-- global_score is the only computed value persisted: derived from all users'
-- votes by scoresComputerService.js, refreshed each computation cycle. Never
-- user-editable directly.
CREATE TABLE IF NOT EXISTS entries (
	id           TEXT PRIMARY KEY,
	name         TEXT NOT NULL,
	image        TEXT NOT NULL DEFAULT 'assets/unknown.svg',
	global_score REAL NOT NULL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS tags (
	id    TEXT PRIMARY KEY,
	label TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_name ON entries(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_tags_label ON tags(label COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS tag_parents (
	tag_id    TEXT NOT NULL REFERENCES tags(id),
	parent_id TEXT NOT NULL REFERENCES tags(id),
	PRIMARY KEY (tag_id, parent_id)
);
CREATE INDEX IF NOT EXISTS idx_tag_parents_parent ON tag_parents(parent_id);

CREATE TABLE IF NOT EXISTS entry_tags (
	entry_id TEXT NOT NULL REFERENCES entries(id),
	tag_id   TEXT NOT NULL REFERENCES tags(id),
	PRIMARY KEY (entry_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(tag_id);

-- password_hash/salt are NULL for a "ghost" account created by a data import
-- (e.g. MALImport) with no credentials yet: the account row already exists
-- (and is already linked to direct_quiz/dual_quiz rows via username), but
-- AccountManager.add() must still treat it as "not registered yet" so the
-- first real registration attaches credentials to it instead of failing.
-- is_admin is never set by the application itself - see README's "Database
-- access" section for how to grant it directly in SQLite.
CREATE TABLE IF NOT EXISTS accounts (
	username      TEXT PRIMARY KEY,
	display_login TEXT NOT NULL,
	password_hash TEXT,
	salt          TEXT,
	is_admin      INTEGER NOT NULL DEFAULT 0
);

-- ON DELETE CASCADE: deleteAccount() (userService.js) calls ACCOUNTS.remove()
-- before deleteUser(), so a removed account's quiz history must be purged
-- automatically rather than relying on that call order to hold forever.
CREATE TABLE IF NOT EXISTS direct_quiz (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
	entry_id TEXT NOT NULL REFERENCES entries(id),
	value    REAL NOT NULL,
	ts       INTEGER NOT NULL,
	UNIQUE (username, entry_id)
);

CREATE TABLE IF NOT EXISTS dual_quiz (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
	neg_id   TEXT NOT NULL REFERENCES entries(id),
	pos_id   TEXT NOT NULL REFERENCES entries(id),
	value    REAL NOT NULL,
	ts       INTEGER NOT NULL,
	UNIQUE (username, neg_id, pos_id)
);

-- Données propres à la relation user<->entry. Pour l'instant, seule la
-- colonne score (dernier score personnel connu, recomputed by
-- computeUserScores() right after a quiz mutation or during the global cycle
-- - never recomputed on read). Nommée sans suffixe "_scores" car destinée à
-- accueillir d'autres attributs par la suite (ex. un alias personnalisé pour
-- l'entrée). A row exists only for an entry the user has voted on (directly
-- or via a dual); rows for quiz-less entries are pruned by the same
-- recompute pass that creates missing ones.
CREATE TABLE IF NOT EXISTS user_entry (
	username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
	entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
	score    REAL NOT NULL DEFAULT 0.5,
	PRIMARY KEY (username, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_user_entry_entry ON user_entry(entry_id);

-- Backs the 'n:<seq>'/'t:<seq>' id convention with a strictly-increasing,
-- never-reused counter per prefix (see entriesRepository/tagsRepository's
-- nextIdForPrefix()) - one atomic UPDATE instead of the old "count rows, probe
-- candidate ids in a loop" approach, which raced under concurrent creates.
CREATE TABLE IF NOT EXISTS id_sequences (
	prefix     TEXT PRIMARY KEY,
	next_value INTEGER NOT NULL DEFAULT 0
);
`

function openDatabase(path) {
	mkdirSync(dirname(path), {recursive: true})
	const db = new DatabaseSync(path)
	db.exec('PRAGMA foreign_keys = ON')
	db.exec(SCHEMA)
	// Migration to express-session (cookie-based, MemoryStore): the homemade
	// token table is no longer read or written, drop it from any database
	// created before this change.
	db.exec('DROP TABLE IF EXISTS sessions')
	// Migration for the Admin flag: SQLite has no "ADD COLUMN IF NOT EXISTS",
	// so check first - re-running this on a database that already has the
	// column would fail ("duplicate column name").
	const accountColumns = db.prepare('PRAGMA table_info(accounts)').all()
	if(!accountColumns.some((col) => col.name === 'is_admin')) {
		db.exec('ALTER TABLE accounts ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0')
	}
	// Migration for the no-memory-cache rework: global_score used to live only
	// in memory (recomputed every cycle, lost on restart, defaulting to 0.5) -
	// now the single source of truth, persisted here instead.
	const entryColumns = db.prepare('PRAGMA table_info(entries)').all()
	if(!entryColumns.some((col) => col.name === 'global_score')) {
		db.exec('ALTER TABLE entries ADD COLUMN global_score REAL NOT NULL DEFAULT 0.5')
	}
	// Migration for the id_sequences rework: seed each prefix's counter one past
	// the highest numeric suffix already in use, so a database created before
	// this change never reissues an id that already exists.
	seedIdSequences(db)
	return db
}

/**
 * (Re)seeds entries'/tags' id_sequences counters to one past the highest
 * numeric suffix currently in use for each prefix ('n:', 't:') - never lower
 * than what's already there (GREATEST-style upsert), so this is always safe
 * to call again after any bulk insert of externally-sourced ids (the legacy
 * JSON import, or a test fixture writing rows directly). Without this, a bulk
 * insert that bypasses getEntryByName()/getTagByLabel() (the only normal
 * callers of the counter) would leave it seeded from an empty table, and the
 * very next created id would collide with one already in use.
 */
function seedIdSequences(db) {
	const idPrefixes = [
		{table: 'entries', column: 'id', prefix: 'n:'},
		{table: 'tags', column: 'id', prefix: 't:'},
	]
	for(const {table, column, prefix} of idPrefixes) {
		const rows = db.prepare(
			`SELECT ${column} AS id FROM ${table} WHERE ${column} LIKE ? ESCAPE '\\'`
		).all(prefix.replace(/[%_]/g, '\\$&') + '%')
		let maxSuffix = -1
		for(const {id} of rows) {
			const suffix = Number(id.slice(prefix.length))
			if(Number.isInteger(suffix) && suffix > maxSuffix) maxSuffix = suffix
		}
		db.prepare(
			'INSERT INTO id_sequences (prefix, next_value) VALUES (?, ?) ' +
			'ON CONFLICT (prefix) DO UPDATE SET next_value = MAX(next_value, excluded.next_value)'
		).run(prefix, maxSuffix + 1)
	}
}

/**
 * Runs `fn` on the next macrotask (setTimeout 0) and wraps the result in a
 * Promise, so this module presents an async interface even though node:sqlite
 * itself is fully synchronous - keeping the door open for a future swap to a
 * genuinely async engine (e.g. a networked Postgres) without touching callers.
 */
function toAsync(fn) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			try {
				resolve(fn())
			} catch (err) {
				reject(err)
			}
		}, 0)
	})
}

/**
 * Thin async wrapper around a node:sqlite DatabaseSync connection. Every
 * method mirrors a synchronous DatabaseSync call, deferred via `toAsync`.
 */
class SqliteConnection {
	constructor(path) {
		// Captured before opening: node:sqlite creates the file as soon as the
		// connection opens, even if empty, so this is the only point where
		// "did this database already exist" can still be observed.
		this.existedBeforeOpen = existsSync(path)
		this.db = openDatabase(path)
	}

	/** Runs `stmt` (no params) once, ignoring any result row. */
	exec(sql) {
		return toAsync(() => this.db.exec(sql))
	}

	/** Runs an INSERT/UPDATE/DELETE, returns {changes, lastInsertRowid}. */
	run(sql, params = []) {
		return toAsync(() => this.db.prepare(sql).run(...params))
	}

	/** Returns the first row matching `sql`, or undefined. */
	get(sql, params = []) {
		return toAsync(() => this.db.prepare(sql).get(...params))
	}

	/** Returns every row matching `sql`. */
	all(sql, params = []) {
		return toAsync(() => this.db.prepare(sql).all(...params))
	}

	/** Runs `fn` (synchronous, receives no argument) inside a transaction. */
	transaction(fn) {
		return toAsync(() => {
			this.db.exec('BEGIN')
			try {
				const result = fn()
				this.db.exec('COMMIT')
				return result
			} catch (err) {
				this.db.exec('ROLLBACK')
				throw err
			}
		})
	}

	close() {
		return toAsync(() => this.db.close())
	}
}

/**
 * Opens (creating the schema if needed) the SQLite database at `path`, then
 * runs the one-shot legacy JSON import if this file didn't already exist -
 * see migrateFromJson.js: SQLite is the sole source of truth from here on,
 * this never re-imports on a later start.
 *
 * No top-level singleton is created in this module on purpose: merely
 * importing SqliteConnection (e.g. a test file building its own throwaway
 * fixture database - see test/integration/helpers/fixtureDb.js) must never
 * open/lock CONFIG.SQLITE_PATH as a side effect of the import graph alone.
 * The single production connection is created explicitly by server.js and
 * threaded through db.js's setSqlite() from there.
 */
async function openSqlite(path) {
	const conn = new SqliteConnection(path)
	if(!conn.existedBeforeOpen) {
		const { migrateFromJsonIfNeeded } = await import('./migrateFromJson.js')
		await migrateFromJsonIfNeeded(conn)
	}
	return conn
}

export { SqliteConnection, SCHEMA, openSqlite, seedIdSequences }
