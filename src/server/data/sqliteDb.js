import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import CONFIG from '../config/config.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
	id    TEXT PRIMARY KEY,
	name  TEXT NOT NULL,
	image TEXT NOT NULL DEFAULT 'assets/unknown.svg'
);

CREATE TABLE IF NOT EXISTS tags (
	id    TEXT PRIMARY KEY,
	label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tag_parents (
	tag_id    TEXT NOT NULL REFERENCES tags(id),
	parent_id TEXT NOT NULL REFERENCES tags(id),
	PRIMARY KEY (tag_id, parent_id)
);

CREATE TABLE IF NOT EXISTS entry_tags (
	entry_id TEXT NOT NULL REFERENCES entries(id),
	tag_id   TEXT NOT NULL REFERENCES tags(id),
	PRIMARY KEY (entry_id, tag_id)
);

-- password_hash/salt are NULL for a "ghost" account created by a data import
-- (e.g. MALImport) with no credentials yet: the account row already exists
-- (and is already linked to direct_quiz/dual_quiz rows via username), but
-- AccountManager.add() must still treat it as "not registered yet" so the
-- first real registration attaches credentials to it instead of failing.
CREATE TABLE IF NOT EXISTS accounts (
	username      TEXT PRIMARY KEY,
	display_login TEXT NOT NULL,
	password_hash TEXT,
	salt          TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
	token_ip_hash TEXT PRIMARY KEY,
	username      TEXT NOT NULL REFERENCES accounts(username) ON DELETE CASCADE,
	issued_at     INTEGER NOT NULL
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
`

function openDatabase(path) {
	mkdirSync(dirname(path), {recursive: true})
	const db = new DatabaseSync(path)
	db.exec('PRAGMA foreign_keys = ON')
	db.exec(SCHEMA)
	return db
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
			} catch(err) {
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
			} catch(err) {
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
 * threaded through persistenceService.js from there.
 */
async function openSqlite(path) {
	const conn = new SqliteConnection(path)
	if(!conn.existedBeforeOpen) {
		const { migrateFromJsonIfNeeded } = await import('./migrateFromJson.js')
		await migrateFromJsonIfNeeded(conn)
	}
	return conn
}

export { SqliteConnection, SCHEMA, openSqlite }
