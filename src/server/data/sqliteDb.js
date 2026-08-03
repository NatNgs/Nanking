import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS topics (
	id    TEXT PRIMARY KEY,
	label TEXT NOT NULL
);

-- global_score is the only computed value persisted: derived from all users'
-- votes by scoresComputerService.js, refreshed each computation cycle. Never
-- user-editable directly. Entries/tags are scoped per topic: the same id can
-- exist independently in two different topics (e.g. imported from the same
-- external source twice), so topic_id is part of the primary key, not just an
-- extra filter column.
CREATE TABLE IF NOT EXISTS entries (
	topic_id     TEXT NOT NULL REFERENCES topics(id),
	id           TEXT NOT NULL,
	name         TEXT NOT NULL,
	image        TEXT NOT NULL DEFAULT 'assets/unknown.svg',
	global_score REAL NOT NULL DEFAULT 0.5,
	PRIMARY KEY (topic_id, id)
);

CREATE TABLE IF NOT EXISTS tags (
	topic_id TEXT NOT NULL REFERENCES topics(id),
	id       TEXT NOT NULL,
	label    TEXT NOT NULL,
	PRIMARY KEY (topic_id, id)
);

CREATE INDEX IF NOT EXISTS idx_entries_name ON entries(topic_id, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_tags_label ON tags(topic_id, label COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS tag_parents (
	topic_id  TEXT NOT NULL,
	tag_id    TEXT NOT NULL,
	parent_id TEXT NOT NULL,
	PRIMARY KEY (topic_id, tag_id, parent_id),
	FOREIGN KEY (topic_id, tag_id) REFERENCES tags(topic_id, id),
	FOREIGN KEY (topic_id, parent_id) REFERENCES tags(topic_id, id)
);
CREATE INDEX IF NOT EXISTS idx_tag_parents_parent ON tag_parents(topic_id, parent_id);

CREATE TABLE IF NOT EXISTS entry_tags (
	topic_id TEXT NOT NULL,
	entry_id TEXT NOT NULL,
	tag_id   TEXT NOT NULL,
	PRIMARY KEY (topic_id, entry_id, tag_id),
	FOREIGN KEY (topic_id, entry_id) REFERENCES entries(topic_id, id),
	FOREIGN KEY (topic_id, tag_id) REFERENCES tags(topic_id, id)
);
CREATE INDEX IF NOT EXISTS idx_entry_tags_tag ON entry_tags(topic_id, tag_id);

-- password_hash/salt are NULL for a "ghost" account created by a data import
-- (e.g. MALImport) with no credentials yet: the account row already exists
-- (and is already linked to direct_quiz/dual_quiz rows via username), but
-- AccountManager.add() must still treat it as "not registered yet" so the
-- first real registration attaches credentials to it instead of failing.
-- is_admin is never set by the application itself - see README's "Database
-- access" section for how to grant it directly in SQLite. Accounts are global
-- across every topic - not scoped, unlike everything below.
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
	topic_id TEXT NOT NULL,
	username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
	entry_id TEXT NOT NULL,
	value    REAL NOT NULL,
	ts       INTEGER NOT NULL,
	UNIQUE (username, topic_id, entry_id),
	FOREIGN KEY (topic_id, entry_id) REFERENCES entries(topic_id, id)
);

CREATE TABLE IF NOT EXISTS dual_quiz (
	id       INTEGER PRIMARY KEY AUTOINCREMENT,
	topic_id TEXT NOT NULL,
	username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
	neg_id   TEXT NOT NULL,
	pos_id   TEXT NOT NULL,
	value    REAL NOT NULL,
	ts       INTEGER NOT NULL,
	UNIQUE (username, topic_id, neg_id, pos_id),
	FOREIGN KEY (topic_id, neg_id) REFERENCES entries(topic_id, id),
	FOREIGN KEY (topic_id, pos_id) REFERENCES entries(topic_id, id)
);

-- Data specific to the user<->entry relationship. For now, only the score
-- column (last known personal score, recomputed by computeUserScores()
-- right after a quiz mutation or during the global cycle - never recomputed
-- on read). Named without a "_scores" suffix since it's meant to eventually
-- hold other attributes too (e.g. a personal alias for the entry). A row
-- exists only for an entry the user has voted on (directly or via a dual);
-- rows for quiz-less entries are pruned by the same recompute pass that
-- creates missing ones.
CREATE TABLE IF NOT EXISTS user_entry (
	username TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
	topic_id TEXT NOT NULL,
	entry_id TEXT NOT NULL,
	score    REAL NOT NULL DEFAULT 0.5,
	PRIMARY KEY (username, topic_id, entry_id),
	FOREIGN KEY (topic_id, entry_id) REFERENCES entries(topic_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_entry_entry ON user_entry(topic_id, entry_id);

-- Backs the 'n:<seq>'/'t:<seq>' id convention with a strictly-increasing,
-- never-reused counter per prefix (see entriesRepository/tagsRepository's
-- nextIdForPrefix()) - one atomic UPDATE instead of the old "count rows, probe
-- candidate ids in a loop" approach, which raced under concurrent creates.
-- The prefix format itself ('n:', 't:') stays topic-agnostic; topic_id joins
-- the key instead so each topic gets its own counter per prefix.
CREATE TABLE IF NOT EXISTS id_sequences (
	topic_id   TEXT NOT NULL,
	prefix     TEXT NOT NULL,
	next_value INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (topic_id, prefix)
);
`

function openDatabase(path) {
	mkdirSync(dirname(path), {recursive: true})
	const db = new DatabaseSync(path)
	db.exec('PRAGMA foreign_keys = ON')
	db.exec(SCHEMA)
	// Seeds each prefix's id counter one past the highest numeric suffix
	// currently in use, so a fresh database starts from the right value.
	seedIdSequences(db)
	return db
}

/**
 * (Re)seeds every topic's entries'/tags' id_sequences counters to one past
 * the highest numeric suffix currently in use for each prefix ('n:', 't:'),
 * per topic - never lower than what's already there (GREATEST-style upsert),
 * so this is always safe to call again after any bulk insert of
 * externally-sourced ids (e.g. a test fixture writing rows directly). Without
 * this, a bulk insert that bypasses getEntryByName()/getTagByLabel() (the only
 * normal callers of the counter) would leave it seeded from an empty table,
 * and the very next created id would collide with one already in use. The
 * prefix format itself stays the same across topics ('n:', 't:') - only the
 * counter is per-topic.
 */
function seedIdSequences(db) {
	const idPrefixes = [
		{table: 'entries', column: 'id', prefix: 'n:'},
		{table: 'tags', column: 'id', prefix: 't:'},
	]
	const topicIds = db.prepare('SELECT id FROM topics').all().map((r) => r.id)
	for(const topicId of topicIds) {
		for(const {table, column, prefix} of idPrefixes) {
			const rows = db.prepare(
				`SELECT ${column} AS id FROM ${table} WHERE topic_id = ? AND ${column} LIKE ? ESCAPE '\\'`
			).all(topicId, prefix.replace(/[%_]/g, '\\$&') + '%')
			let maxSuffix = -1
			for(const {id} of rows) {
				const suffix = Number(id.slice(prefix.length))
				if(Number.isInteger(suffix) && suffix > maxSuffix) maxSuffix = suffix
			}
			db.prepare(
				'INSERT INTO id_sequences (topic_id, prefix, next_value) VALUES (?, ?, ?) ' +
				'ON CONFLICT (topic_id, prefix) DO UPDATE SET next_value = MAX(next_value, excluded.next_value)'
			).run(topicId, prefix, maxSuffix + 1)
		}
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
 * Opens (creating the schema if needed) the SQLite database at `path`.
 *
 * No top-level singleton is created in this module on purpose: merely
 * importing SqliteConnection (e.g. a test file building its own throwaway
 * fixture database - see test/integration/helpers/fixtureDb.js) must never
 * open/lock CONFIG.SQLITE_PATH as a side effect of the import graph alone.
 * The single production connection is created explicitly by server.js and
 * threaded through db.js's setSqlite() from there.
 */
async function openSqlite(path) {
	return new SqliteConnection(path)
}

export { SqliteConnection, SCHEMA, openSqlite, seedIdSequences }
