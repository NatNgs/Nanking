import { Tag } from './tagsModel.js'
import { toLikePattern } from './entriesRepository.js'

function rowToTag(row, parentsByTag) {
	const tag = new Tag(row.id, row.label)
	tag.parents = parentsByTag?.[row.id] || []
	return tag
}

async function loadParentsForTagIds(sqlite, ids) {
	if(!ids.length) return {}
	const placeholders = ids.map(() => '?').join(',')
	const rows = await sqlite.all(
		`SELECT tag_id, parent_id FROM tag_parents WHERE tag_id IN (${placeholders})`, ids
	)
	const parentsByTag = {}
	for(const {tag_id, parent_id} of rows) {
		(parentsByTag[tag_id] ??= []).push(parent_id)
	}
	return parentsByTag
}

/**
 * Finds a tag by exact label (case-sensitive), or creates it if missing and
 * `createIfNotExists` is true - mirroring the old TagsManager.getTagByLabel()'s
 * auto-incremented id convention (`t:0`, `t:1`, ...), same "start from the
 * current count, never reuse a freed id" logic as entriesRepository.getEntryByName().
 */
async function getTagByLabel(sqlite, label, createIfNotExists=false) {
	label = label.trim()
	const row = await sqlite.get('SELECT id, label FROM tags WHERE label = ?', [label])
	if(row) return rowToTag(row, await loadParentsForTagIds(sqlite, [row.id]))
	if(!createIfNotExists) return null

	return sqlite.transaction(() => {
		const db = sqlite.db
		const {value} = db.prepare(
			'UPDATE id_sequences SET next_value = next_value + 1 WHERE prefix = ? RETURNING next_value - 1 AS value'
		).get('t:')
		const tag = new Tag('t:' + value, label)
		db.prepare('INSERT INTO tags (id, label) VALUES (?, ?)').run(tag.id, tag.label)
		return tag
	})
}

/**
 * Looks for a tag whose label matches `label` case-insensitively, skipping
 * `excludeTagId` (typically the tag being renamed).
 */
async function getTagByLabelIgnoreCase(sqlite, label, excludeTagId=null) {
	const row = await sqlite.get(
		'SELECT id, label FROM tags WHERE label = ? COLLATE NOCASE AND id != ?',
		[label.trim(), String(excludeTagId ?? '')]
	)
	if(!row) return null
	return rowToTag(row, await loadParentsForTagIds(sqlite, [row.id]))
}

/** Fuzzy search by label (LIKE), sorted by label length, capped to 32 results. */
async function searchTag(sqlite, searchInput) {
	const pattern = toLikePattern(searchInput)
	const rows = await sqlite.all(
		"SELECT id, label FROM tags WHERE label LIKE ? ESCAPE '\\' ORDER BY LENGTH(label) ASC LIMIT 32",
		[pattern]
	)
	const parentsByTag = await loadParentsForTagIds(sqlite, rows.map((r) => r.id))
	return rows.map((row) => rowToTag(row, parentsByTag))
}

/** Returns the tag (with its parents[] populated), or null if unknown. */
async function getTagById(sqlite, id) {
	const row = await sqlite.get('SELECT id, label FROM tags WHERE id = ?', [id])
	if(!row) return null
	return rowToTag(row, await loadParentsForTagIds(sqlite, [id]))
}

/** Every tag, with its parents[] populated - for searchTags() with no `q`. */
async function getAllTags(sqlite) {
	const rows = await sqlite.all('SELECT id, label FROM tags')
	const parentsByTag = await loadParentsForTagIds(sqlite, rows.map((r) => r.id))
	return rows.map((row) => rowToTag(row, parentsByTag))
}

/** Batched version of getTagById - see entriesRepository.getEntriesByIds(). */
async function getTagsByIds(sqlite, ids) {
	const uniqueIds = [...new Set(ids)]
	if(!uniqueIds.length) return new Map()
	const placeholders = uniqueIds.map(() => '?').join(',')
	const rows = await sqlite.all(`SELECT id, label FROM tags WHERE id IN (${placeholders})`, uniqueIds)
	const parentsByTag = await loadParentsForTagIds(sqlite, rows.map((r) => r.id))
	const result = new Map()
	for(const row of rows) result.set(row.id, rowToTag(row, parentsByTag))
	return result
}

/**
 * Set of tagId + every more generic tag it transitively inherits from,
 * computed in one recursive SQL query (WITH RECURSIVE, supported by
 * node:sqlite) instead of an in-memory DFS.
 */
async function getAncestorIds(sqlite, tagId) {
	const rows = await sqlite.all(`
		WITH RECURSIVE anc(id) AS (
			SELECT ?
			UNION
			SELECT tp.parent_id FROM tag_parents tp JOIN anc ON tp.tag_id = anc.id
		)
		SELECT id FROM anc
	`, [tagId])
	return new Set(rows.map((r) => r.id))
}

/**
 * Set of tagId + every more specific tag that transitively has it as an
 * ancestor (the reverse relation), also via WITH RECURSIVE.
 */
async function getDescendantIds(sqlite, tagId) {
	const rows = await sqlite.all(`
		WITH RECURSIVE descendant(id) AS (
			SELECT ?
			UNION
			SELECT tp.tag_id FROM tag_parents tp JOIN descendant ON tp.parent_id = descendant.id
		)
		SELECT id FROM descendant
	`, [tagId])
	return new Set(rows.map((r) => r.id))
}

/**
 * Direct children of `tagId`: every tag having `tagId` in its own parents
 * list. Still needed post-migration (unlike topologicalOrder(), removed along
 * with the dead tag-scores feature) for getChildTree()'s UI display and
 * pruneOrphanTagIds().
 */
async function getDirectChildren(sqlite, tagId) {
	const rows = await sqlite.all(`
		SELECT t.id, t.label FROM tags t
		JOIN tag_parents tp ON tp.tag_id = t.id
		WHERE tp.parent_id = ?
	`, [tagId])
	return rows.map((row) => rowToTag(row))
}

/**
 * Batched version of getDirectChildren: direct children of every tag in
 * `tagIds` in a single round-trip, grouped by parent id. Used by
 * getChildTree() to fetch grand-children for a whole level at once instead of
 * one query per tag.
 */
async function getDirectChildrenForTagIds(sqlite, tagIds) {
	const uniqueIds = [...new Set(tagIds)]
	if(!uniqueIds.length) return new Map()
	const placeholders = uniqueIds.map(() => '?').join(',')
	const rows = await sqlite.all(`
		SELECT t.id, t.label, tp.parent_id FROM tags t
		JOIN tag_parents tp ON tp.tag_id = t.id
		WHERE tp.parent_id IN (${placeholders})
	`, uniqueIds)
	const result = new Map(uniqueIds.map((id) => [id, []]))
	for(const row of rows) result.get(row.parent_id).push(rowToTag(row))
	return result
}

/**
 * True if adding `newParentId` as a parent of `tagId` would create a cycle:
 * either a self-reference, or `tagId` already an ancestor of `newParentId`.
 */
async function wouldCreateCycle(sqlite, tagId, newParentId) {
	if(tagId === newParentId) return true
	const ancestors = await getAncestorIds(sqlite, newParentId)
	return ancestors.has(tagId)
}

/**
 * Adds `newParentId` as a parent of `tagId`. Returns
 * 'not_found' | 'cycle' | 'conflict' | 'ok'. Runs the existence/conflict/cycle
 * checks and the insert inside a single transaction (see SqliteConnection's
 * transaction(), synchronous access to sqlite.db) so a concurrent request
 * can never slip a cyclic edge in between the check and the insert.
 */
async function addParent(sqlite, tagId, newParentId) {
	return sqlite.transaction(() => {
		const db = sqlite.db
		const tag = db.prepare('SELECT id FROM tags WHERE id = ?').get(tagId)
		const parent = db.prepare('SELECT id FROM tags WHERE id = ?').get(newParentId)
		if(!tag || !parent) return 'not_found'
		if(tagId === newParentId) return 'cycle'
		const conflict = db.prepare(
			'SELECT 1 FROM tag_parents WHERE tag_id = ? AND parent_id = ?'
		).get(tagId, newParentId)
		if(conflict) return 'conflict'
		const cycle = db.prepare(`
			WITH RECURSIVE anc(id) AS (
				SELECT ? UNION SELECT tp.parent_id FROM tag_parents tp JOIN anc ON tp.tag_id = anc.id
			) SELECT 1 FROM anc WHERE id = ?
		`).get(newParentId, tagId)
		if(cycle) return 'cycle'
		db.prepare('INSERT INTO tag_parents (tag_id, parent_id) VALUES (?, ?)').run(tagId, newParentId)
		return 'ok'
	})
}

/** Removes `parentIdToRemove` from tagId's parents. Idempotent, 'not_found' | 'ok'. */
async function removeParent(sqlite, tagId, parentIdToRemove) {
	const tag = await sqlite.get('SELECT 1 FROM tags WHERE id = ?', [tagId])
	if(!tag) return 'not_found'
	await sqlite.run('DELETE FROM tag_parents WHERE tag_id = ? AND parent_id = ?', [tagId, parentIdToRemove])
	return 'ok'
}

/**
 * Tag ids with no relation at all (no parent, no derived child, not used by
 * any entry) - left out of the persisted DB, so they stop existing on the
 * next prune instead of exposing a dedicated delete route.
 */
async function pruneOrphanTagIds(sqlite) {
	const rows = await sqlite.all(`
		SELECT t.id FROM tags t
		WHERE NOT EXISTS (SELECT 1 FROM tag_parents WHERE tag_id = t.id)
		  AND NOT EXISTS (SELECT 1 FROM tag_parents WHERE parent_id = t.id)
		  AND NOT EXISTS (SELECT 1 FROM entry_tags WHERE tag_id = t.id)
	`)
	return rows.map((r) => r.id)
}

/**
 * Upserts a single tag (label) and fully resyncs its tag_parents rows to
 * tag.parents - targeted save, mirrors entriesRepository.saveEntry().
 */
async function saveTag(sqlite, tag) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		db.prepare(
			'INSERT INTO tags (id, label) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET label = excluded.label'
		).run(tag.id, tag.label)
		db.prepare('DELETE FROM tag_parents WHERE tag_id = ?').run(tag.id)
		const insertParent = db.prepare('INSERT OR IGNORE INTO tag_parents (tag_id, parent_id) VALUES (?, ?)')
		for(const parentId of tag.parents) insertParent.run(tag.id, parentId)
	})
}

/** Permanently deletes a tag (and its tag_parents/entry_tags rows). */
async function deleteTag(sqlite, id) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		db.prepare('DELETE FROM tag_parents WHERE tag_id = ? OR parent_id = ?').run(id, id)
		db.prepare('DELETE FROM entry_tags WHERE tag_id = ?').run(id)
		db.prepare('DELETE FROM tags WHERE id = ?').run(id)
	})
}

export {
	getTagByLabel, getTagByLabelIgnoreCase, searchTag, getTagById, getTagsByIds, getAllTags,
	getAncestorIds, getDescendantIds, getDirectChildren, getDirectChildrenForTagIds, wouldCreateCycle,
	addParent, removeParent, pruneOrphanTagIds, saveTag, deleteTag,
}
