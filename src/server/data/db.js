/**
 * Accessor for the single production SQLite connection (a SqliteConnection
 * instance - see sqliteDb.js). This holds the technical connection handle
 * only, never business data: repositories/services always reload whatever
 * they need from SQLite on demand rather than caching Entry/Tag/User objects
 * here - see server.js's setSqlite() call right after openSqlite().
 */
let sqlite = null

function setSqlite(connection) {
	sqlite = connection
}

function getSqlite() {
	return sqlite
}

export { setSqlite, getSqlite }
