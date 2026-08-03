import { existsSync } from 'node:fs'
import { SqliteConnection } from '../data/sqliteDb.js'
import CONFIG from '../config/config.js'

/**
 * First-run initialization: a database file that doesn't exist yet gets its
 * schema created (SqliteConnection's constructor runs sqliteDb.js's
 * openDatabase(), which applies SCHEMA) and its first topic seeded from
 * config (CONFIG.DEFAULT_TOPIC) - without this, every route/job assuming at
 * least one topic exists (e.g. entries.topic_id's FOREIGN KEY REFERENCES
 * topics(id)) would fail on a brand new install. Detected here (existsSync),
 * rather than in sqliteDb.js itself, since "did the file exist before this
 * process touched it" can only be observed before anything opens it - see
 * SqliteConnection's own docstring history on this point.
 */
function ensureDefaultTopic() {
	if(existsSync(CONFIG.SQLITE_PATH)) return

	const conn = new SqliteConnection(CONFIG.SQLITE_PATH)
	conn.db.prepare(
		'INSERT OR IGNORE INTO topics (id, label) VALUES (?, ?)'
	).run(CONFIG.DEFAULT_TOPIC, CONFIG.DEFAULT_TOPIC)
	conn.db.close()
}

/**
 * Single entry point for database migrations. Called at server startup,
 * before the SQLite connection opens (see server.js): every migration must
 * run against the raw file before sqliteDb.js applies its current schema.
 *
 * Currently only seeds the first topic (see ensureDefaultTopic()). When
 * another migration becomes necessary (a schema change on an existing
 * database), add it here and call it from this function, in chronological
 * order of schema versions.
 */
function tryToMigrate() {
	ensureDefaultTopic()
}

export { tryToMigrate }
