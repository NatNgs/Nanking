import { Entry } from '../model/entriesModel.js'

/**
 * Converts a `searchInput` using the app's existing wildcard convention
 * (`*` as multi-char wildcard, e.g. "*.js's regex-based search - see the old
 * EntriesManager.searchEntry()/TagsManager.searchTag()) into a SQL LIKE
 * pattern: `*` becomes `%`, and any literal `%`/`_` (LIKE's own wildcards)
 * is escaped so it matches literally instead of being interpreted by SQLite.
 */
function toLikePattern(searchInput) {
	const escaped = searchInput.replace(/[%_]/g, '\\$&')
	return '%' + escaped.replace(/\*/g, '%').replace(/\s+/g, '%') + '%'
}

function rowToEntry(row, tagsByEntry) {
	const entry = new Entry(row.id, row.name)
	entry.image = row.image
	entry.globalScore = row.global_score
	entry.tags = tagsByEntry?.[row.id] || []
	return entry
}

async function loadTagsForEntryIds(sqlite, topicId, ids) {
	if(!ids.length) return {}
	const placeholders = ids.map(() => '?').join(',')
	const rows = await sqlite.all(
		`SELECT entry_id, tag_id FROM entry_tags WHERE topic_id = ? AND entry_id IN (${placeholders})`,
		[topicId, ...ids]
	)
	const tagsByEntry = {}
	for(const {entry_id, tag_id} of rows) {
		(tagsByEntry[entry_id] ??= []).push(tag_id)
	}
	return tagsByEntry
}

/**
 * Finds an entry by exact name (case-sensitive), or creates it if missing and
 * `createIfNotExists` is true - mirroring the old EntriesManager.getEntryByName()'s
 * auto-incremented id convention (`n:0`, `n:1`, ...). Scoped to `topicId`: the
 * same name can exist independently in different topics.
 */
async function getEntryByName(sqlite, topicId, name, createIfNotExists=false) {
	name = name.trim()
	const row = await sqlite.get(
		'SELECT id, name, image, global_score FROM entries WHERE topic_id = ? AND name = ?', [topicId, name]
	)
	if(row) return rowToEntry(row, await loadTagsForEntryIds(sqlite, topicId, [row.id]))
	if(!createIfNotExists) return null

	return sqlite.transaction(() => {
		const db = sqlite.db
		// Upsert rather than a plain UPDATE: a topic created after startup (or
		// a test inserting straight into `topics`) has no id_sequences row yet
		// - seedIdSequences() only seeds known topics at boot, not new ones.
		const {value} = db.prepare(
			'INSERT INTO id_sequences (topic_id, prefix, next_value) VALUES (?, ?, 1) '
			+ 'ON CONFLICT (topic_id, prefix) DO UPDATE SET next_value = next_value + 1 '
			+ 'RETURNING next_value - 1 AS value'
		).get(topicId, 'n:')
		const entry = new Entry('n:' + value, name)
		db.prepare('INSERT INTO entries (topic_id, id, name) VALUES (?, ?, ?)').run(topicId, entry.id, entry.name)
		return entry
	})
}

/**
 * Looks for an entry whose name matches `name` case-insensitively, skipping
 * `excludeEntryId` (typically the entry being renamed, so it never conflicts
 * with itself).
 */
async function getEntryByNameIgnoreCase(sqlite, topicId, name, excludeEntryId=null) {
	const row = await sqlite.get(
		'SELECT id, name, image, global_score FROM entries WHERE topic_id = ? AND name = ? COLLATE NOCASE AND id != ?',
		[topicId, name.trim(), String(excludeEntryId ?? '')]
	)
	if(!row) return null
	return rowToEntry(row, await loadTagsForEntryIds(sqlite, topicId, [row.id]))
}

/**
 * Fuzzy search by name (LIKE, see toLikePattern()), sorted by name length
 * (shortest/closest match first) and capped to 32 results - same convention
 * as the old EntriesManager.searchEntry().
 */
async function searchEntry(sqlite, topicId, searchInput) {
	const pattern = toLikePattern(searchInput)
	const rows = await sqlite.all(
		`SELECT id, name, image, global_score FROM entries
		WHERE topic_id = ? AND name LIKE ? ESCAPE '\\' ORDER BY LENGTH(name) ASC LIMIT 32`,
		[topicId, pattern]
	)
	const tagsByEntry = await loadTagsForEntryIds(sqlite, topicId, rows.map((r) => r.id))
	return rows.map((row) => rowToEntry(row, tagsByEntry))
}

/** Returns the entry (with its tags[] populated), or null if unknown. */
async function getEntryById(sqlite, topicId, id) {
	const row = await sqlite.get(
		'SELECT id, name, image, global_score FROM entries WHERE topic_id = ? AND id = ?', [topicId, id]
	)
	if(!row) return null
	return rowToEntry(row, await loadTagsForEntryIds(sqlite, topicId, [id]))
}

/**
 * Batched version of getEntryById, for callers that need several entries at
 * once (e.g. resolving every entry referenced by a user's quiz history)
 * without one round-trip per id. Returns a Map<id, Entry>; unknown ids are
 * simply absent from the result.
 */
async function getEntriesByIds(sqlite, topicId, ids) {
	const uniqueIds = [...new Set(ids)]
	if(!uniqueIds.length) return new Map()
	const placeholders = uniqueIds.map(() => '?').join(',')
	const rows = await sqlite.all(
		`SELECT id, name, image, global_score FROM entries WHERE topic_id = ? AND id IN (${placeholders})`,
		[topicId, ...uniqueIds]
	)
	const tagsByEntry = await loadTagsForEntryIds(sqlite, topicId, rows.map((r) => r.id))
	const result = new Map()
	for(const row of rows) result.set(row.id, rowToEntry(row, tagsByEntry))
	return result
}

/**
 * Every entry with its current global_score and tags[] populated - used by
 * listEntries() (without a search query) and getEntriesForTag(), which both
 * need to inspect every entry's tags to filter/sort them.
 */
async function getAllEntriesWithScores(sqlite, topicId) {
	const rows = await sqlite.all('SELECT id, name, image, global_score FROM entries WHERE topic_id = ?', [topicId])
	const tagsByEntry = await loadTagsForEntryIds(sqlite, topicId, rows.map((r) => r.id))
	return rows.map((row) => rowToEntry(row, tagsByEntry))
}

/**
 * Upserts a single entry (name, image, global_score) and fully resyncs its
 * entry_tags rows to entry.tags - a targeted save, unlike the old
 * saveEntries() which full-diffed the entire in-memory collection against
 * SQLite (unsafe now that only a subset of entries is ever loaded at once).
 */
async function saveEntry(sqlite, topicId, entry) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		db.prepare(
			'INSERT INTO entries (topic_id, id, name, image, global_score) VALUES (?, ?, ?, ?, ?) ' +
			'ON CONFLICT (topic_id, id) DO UPDATE SET '
			+ 'name = excluded.name, image = excluded.image, global_score = excluded.global_score'
		).run(topicId, entry.id, entry.name, entry.image, entry.globalScore)
		db.prepare('DELETE FROM entry_tags WHERE topic_id = ? AND entry_id = ?').run(topicId, entry.id)
		const insertTag = db.prepare(
			'INSERT OR IGNORE INTO entry_tags (topic_id, entry_id, tag_id) VALUES (?, ?, ?)'
		)
		for(const tagId of entry.tags) insertTag.run(topicId, entry.id, tagId)
	})
}

/** Permanently deletes an entry (and its entry_tags rows). */
async function deleteEntry(sqlite, topicId, id) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		db.prepare('DELETE FROM entry_tags WHERE topic_id = ? AND entry_id = ?').run(topicId, id)
		db.prepare('DELETE FROM entries WHERE topic_id = ? AND id = ?').run(topicId, id)
	})
}

export {
	getEntryByName, getEntryByNameIgnoreCase, searchEntry, getEntryById,
	getEntriesByIds, getAllEntriesWithScores, saveEntry, deleteEntry, toLikePattern,
}
