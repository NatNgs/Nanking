import TAGS from '../data/tags.js'
import ENTRIES from '../data/entries.js'
import { compareBy } from '../lib/pagination.js'
import { saveTags, saveEntries } from './persistenceService.js'

/**
 * Serializes a tag for the HTTP response.
 */
function getTagData(id) {
	const tag = TAGS.getTagById(id)
	if(!tag) return null
	return {
		id: tag.id,
		label: tag.label,
		score: tag.score,
		parents: tag.parents.slice(),
	}
}

/**
 * Renames a tag after checking no other tag already uses this label
 * (case-insensitive). Returns 'not_found' | 'invalid' | 'conflict' | 'ok'.
 */
function renameTag(id, newLabel) {
	const tag = TAGS.getTagById(id)
	if(!tag) return 'not_found'

	const trimmed = (newLabel || '').trim()
	if(!trimmed) return 'invalid'
	if(TAGS.getTagByLabelIgnoreCase(trimmed, id)) return 'conflict'

	tag.label = trimmed
	saveTags().catch((err) => console.error('saveTags() failed:', err))
	return 'ok'
}

/**
 * Finds a tag by label (case-sensitive exact match, like getEntryByName), or
 * creates it if missing. Never returns null.
 */
function getOrCreateTag(label) {
	return TAGS.getTagByLabel(label, true)
}

/**
 * Adds `newParentId` as a parent of `tagId`. Returns
 * 'not_found' | 'cycle' | 'conflict' | 'ok'.
 */
function addTagParent(tagId, newParentId) {
	const result = TAGS.addParent(tagId, newParentId)
	if(result === 'ok') saveTags().catch((err) => console.error('saveTags() failed:', err))
	return result
}

/**
 * Removes the parent link. Returns 'not_found' | 'ok'.
 */
function removeTagParent(tagId, parentIdToRemove) {
	const result = TAGS.removeParent(tagId, parentIdToRemove)
	if(result === 'ok') saveTags().catch((err) => console.error('saveTags() failed:', err))
	return result
}

/**
 * Parent tree for /tag/:id display, depth 2: direct parents (level 1) and
 * their own direct parents (level 2, "grand-parents"). Not deduplicated:
 * a tag reachable through multiple branches (multiple inheritance) appears
 * once per branch, each shown in its own parental context.
 */
function getParentTree(tagId) {
	const tag = TAGS.getTagById(tagId)
	if(!tag) return []
	return tag.parents.map((parentId) => {
		const parent = TAGS.getTagById(parentId)
		if(!parent) return null
		return {
			id: parent.id,
			label: parent.label,
			parents: parent.parents.map((gpId) => {
				const gp = TAGS.getTagById(gpId)
				return gp ? {id: gp.id, label: gp.label} : null
			}).filter(Boolean),
		}
	}).filter(Boolean)
}

/**
 * Child tree for /tag/:id display, depth 2: direct children (derived from
 * other tags' `parents`) and their own direct children.
 */
function getChildTree(tagId) {
	const directChildren = TAGS.getDirectChildren(tagId)
	return directChildren.map((child) => ({
		id: child.id,
		label: child.label,
		children: TAGS.getDirectChildren(child.id).map((gc) => ({id: gc.id, label: gc.label})),
	}))
}

/**
 * Every entry considered linked to `tagId`: tagged directly with tagId, or
 * with any tag more specific than tagId (a descendant, in the inheritance
 * sense: specific tags propagate up to their generic ancestors). Each entry
 * is enriched with its global score and, when `user` is given, that user's
 * own score on it (stretched 0-1 the same way EntriesPanel's list is,
 * omitted entirely if the user never scored this entry). Sorted by
 * `sort`/`order` (globalScore desc by default), matching listEntries'
 * conventions for /api/entries.
 */
function getEntriesForTag(tagId, {user, sort, order} = {}) {
	const relevantTagIds = TAGS.getDescendants(tagId) // includes tagId + every more specific tag
	const result = []
	for(const entryId in ENTRIES.entries) {
		const entry = ENTRIES.entries[entryId]
		if(!entry.tags.some((t) => relevantTagIds.has(t))) continue

		const item = {id: entry.id, label: entry.name, image: entry.image, globalScore: entry.globalScore}
		const userScore = user?.getStretchedScore(entry.id)
		if(userScore != null) item.score = userScore
		result.push(item)
	}

	let sortKey
	if(sort === 'label') sortKey = (e) => e.label
	else if(sort === 'score') sortKey = (e) => e.score // undefined (no user score) sorts last, see compareBy
	else sortKey = (e) => e.globalScore
	const defaultOrder = sort === 'label' ? 'asc' : 'desc'
	result.sort(compareBy(sortKey, order || defaultOrder))
	return result
}

/**
 * True if `entry` is already "covered" by `tagId`: either tagId is already a
 * direct tag on the entry, or one of the entry's direct tags is more specific
 * than tagId (a descendant), meaning tagId is already inherited. Used to
 * disable the [+] button client-side, and to validate server-side before add.
 */
function isTagCoveredByEntry(entry, tagId) {
	const descendants = TAGS.getDescendants(tagId)
	return entry.tags.some((directTagId) => descendants.has(directTagId))
}

/**
 * Adds tagId to entry.tags after checking coverage. Returns
 * 'not_found' (unknown entry or tag) | 'already_covered' | 'ok'.
 */
function addTagToEntry(entryId, tagId) {
	const entry = ENTRIES.getEntryById(entryId)
	const tag = TAGS.getTagById(tagId)
	if(!entry || !tag) return 'not_found'
	if(isTagCoveredByEntry(entry, tagId)) return 'already_covered'

	entry.tags.push(tagId)
	saveEntries().catch((err) => console.error('saveEntries() failed:', err))
	return 'ok'
}

/**
 * Removes tagId from entry.tags (only the direct link). Returns
 * 'not_found' | 'ok'. Idempotent if already absent.
 */
function removeTagFromEntry(entryId, tagId) {
	const entry = ENTRIES.getEntryById(entryId)
	if(!entry) return 'not_found'

	entry.tags = entry.tags.filter((t) => t !== tagId)
	saveEntries().catch((err) => console.error('saveEntries() failed:', err))
	return 'ok'
}

/**
 * Resolves an entry's direct tag ids into {id, label} pairs for the HTTP
 * response, so the client never has to fetch each tag individually.
 */
function resolveEntryTags(entry) {
	return entry.tags.map((tagId) => {
		const tag = TAGS.getTagById(tagId)
		return tag ? {id: tag.id, label: tag.label} : null
	}).filter(Boolean)
}

/**
 * Single filtered tag search, backing POST /api/tags/search. Composable
 * filters:
 * - notOnEntity: excludes tags already covered on this entry
 * - notHavingAsChild: excludes, for each given tagId, every tag already more
 *   specific than it (its descendants) — adding such a candidate as a parent
 *   of tagId would create a cycle. Used to propose valid parents for tagId.
 * - notHavingAsParent: excludes, for each given tagId, every tag already more
 *   generic than it (its ancestors) — symmetric filter, kept for future use.
 */
function searchTags({q, notOnEntity, notHavingAsParent, notHavingAsChild} = {}) {
	let candidates = q ? TAGS.searchTag(q) : Object.values(TAGS.tags)

	if(notOnEntity) {
		const entry = ENTRIES.getEntryById(notOnEntity)
		if(entry) candidates = candidates.filter((t) => !isTagCoveredByEntry(entry, t.id))
	}
	if(Array.isArray(notHavingAsChild)) {
		const excluded = new Set()
		for(const tagId of notHavingAsChild) {
			for(const descendantId of TAGS.getDescendants(tagId)) excluded.add(descendantId)
		}
		candidates = candidates.filter((t) => !excluded.has(t.id))
	}
	if(Array.isArray(notHavingAsParent)) {
		const excluded = new Set()
		for(const tagId of notHavingAsParent) {
			for(const ancestorId of TAGS.getAncestors(tagId)) excluded.add(ancestorId)
		}
		candidates = candidates.filter((t) => !excluded.has(t.id))
	}

	return candidates
}

export {
	getTagData, renameTag, getOrCreateTag, addTagParent, removeTagParent,
	getParentTree, getChildTree, getEntriesForTag, isTagCoveredByEntry,
	addTagToEntry, removeTagFromEntry, resolveEntryTags, searchTags,
}
