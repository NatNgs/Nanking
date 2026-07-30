import {
	getTagById, getTagsByIds, getTagByLabelIgnoreCase, getTagByLabel, searchTag,
	getDirectChildren, getDirectChildrenForTagIds, getAllTags,
	getDescendantIds, getAncestorIds, addParent, removeParent, saveTag,
} from '../repository/tagsRepository.js'
import { getEntryById, getEntriesByIds, getAllEntriesWithScores, saveEntry } from '../repository/entriesRepository.js'
import { compareBy } from '../lib/pagination.js'

/**
 * Serializes a tag for the HTTP response.
 */
async function getTagData(sqlite, id) {
	const tag = await getTagById(sqlite, id)
	if(!tag) return null
	return {
		id: tag.id,
		label: tag.label,
		parents: tag.parents.slice(),
	}
}

/**
 * True if `user` is allowed to mutate `tagId` (rename, add/remove a parent):
 * either an Admin, or someone who has at least one quiz vote referencing an
 * entry covered by this tag (directly tagged, or tagged with one of its
 * descendants - the inheritance sense, see isTagCoveredByEntry). Anonymous
 * callers are never allowed.
 */
async function canEditTag(sqlite, user, tagId) {
	if(!user) return false
	if(user.isAdmin) return true

	const coveredTagIds = await getDescendantIds(sqlite, tagId) // tagId + every more specific tag
	const votedEntryIds = new Set()
	for(const q of user.quiz) {
		if(q.type === 'direct') votedEntryIds.add(q.entry.id)
		else { votedEntryIds.add(q.neg.id); votedEntryIds.add(q.pos.id) }
	}
	if(!votedEntryIds.size) return false

	const entries = await getEntriesByIds(sqlite, [...votedEntryIds])
	for(const entry of entries.values()) {
		if(entry.tags.some((t) => coveredTagIds.has(t))) return true
	}
	return false
}

/**
 * Renames a tag after checking no other tag already uses this label
 * (case-insensitive). Returns 'not_found' | 'invalid' | 'conflict' | 'ok'.
 */
async function renameTag(sqlite, id, newLabel) {
	const tag = await getTagById(sqlite, id)
	if(!tag) return 'not_found'

	const trimmed = (newLabel || '').trim()
	if(!trimmed) return 'invalid'
	if(await getTagByLabelIgnoreCase(sqlite, trimmed, id)) return 'conflict'

	tag.label = trimmed
	await saveTag(sqlite, tag)
	return 'ok'
}

/**
 * Finds a tag by label (case-sensitive exact match, like getEntryByName), or
 * creates it if missing. Never returns null.
 */
async function getOrCreateTag(sqlite, label) {
	return getTagByLabel(sqlite, label, true)
}

/**
 * Adds `newParentId` as a parent of `tagId`. Returns
 * 'not_found' | 'cycle' | 'conflict' | 'ok'.
 */
async function addTagParent(sqlite, tagId, newParentId) {
	return addParent(sqlite, tagId, newParentId)
}

/**
 * Removes the parent link. Returns 'not_found' | 'ok'.
 */
async function removeTagParent(sqlite, tagId, parentIdToRemove) {
	return removeParent(sqlite, tagId, parentIdToRemove)
}

/**
 * Parent tree for /tag/:id display, depth 2: direct parents (level 1) and
 * their own direct parents (level 2, "grand-parents"). Not deduplicated:
 * a tag reachable through multiple branches (multiple inheritance) appears
 * once per branch, each shown in its own parental context. Each level is
 * fetched in one batched round-trip (getTagsByIds) rather than one query per
 * tag.
 */
async function getParentTree(sqlite, tagId) {
	const tag = await getTagById(sqlite, tagId)
	if(!tag) return []

	const parentsById = await getTagsByIds(sqlite, tag.parents)
	const grandParentIds = [...parentsById.values()].flatMap((p) => p.parents)
	const grandParentsById = await getTagsByIds(sqlite, grandParentIds)

	const result = []
	for(const parentId of tag.parents) {
		const parent = parentsById.get(parentId)
		if(!parent) continue
		const grandParents = parent.parents
			.map((gpId) => grandParentsById.get(gpId))
			.filter(Boolean)
			.map((gp) => ({id: gp.id, label: gp.label}))
		result.push({id: parent.id, label: parent.label, parents: grandParents})
	}
	return result
}

/**
 * Child tree for /tag/:id display, depth 2: direct children (derived from
 * other tags' `parents`) and their own direct children. Grand-children for
 * every direct child are fetched in one batched round-trip
 * (getDirectChildrenForTagIds) rather than one query per child.
 */
async function getChildTree(sqlite, tagId) {
	const directChildren = await getDirectChildren(sqlite, tagId)
	const grandChildrenByParent = await getDirectChildrenForTagIds(sqlite, directChildren.map((c) => c.id))

	return directChildren.map((child) => ({
		id: child.id, label: child.label,
		children: (grandChildrenByParent.get(child.id) || []).map((gc) => ({id: gc.id, label: gc.label})),
	}))
}

/**
 * Every entry considered linked to `tagId`: tagged directly with tagId, or
 * with any tag more specific than tagId (a descendant, in the inheritance
 * sense: specific tags propagate up to their generic ancestors). Each entry
 * is enriched with its global score and, when `user` is given, that user's
 * own score on it (omitted entirely if the user never scored this entry).
 * Sorted by `sort`/`order` (globalScore desc by default), matching listEntries'
 * conventions for /api/entries.
 */
async function getEntriesForTag(sqlite, tagId, {user, sort, order} = {}) {
	const relevantTagIds = await getDescendantIds(sqlite, tagId) // includes tagId + every more specific tag
	const entries = await getAllEntriesWithScores(sqlite)
	const result = []
	for(const entry of entries) {
		if(!entry.tags.some((t) => relevantTagIds.has(t))) continue

		const item = {id: entry.id, label: entry.name, image: entry.image, globalScore: entry.globalScore}
		if(user && Object.hasOwn(user.entries, entry.id)) item.score = user.entries[entry.id]
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
async function isTagCoveredByEntry(sqlite, entry, tagId) {
	const descendants = await getDescendantIds(sqlite, tagId)
	return entry.tags.some((directTagId) => descendants.has(directTagId))
}

/**
 * Adds tagId to entry.tags after checking coverage. Returns
 * 'not_found' (unknown entry or tag) | 'already_covered' | 'ok'.
 */
async function addTagToEntry(sqlite, entryId, tagId) {
	const entry = await getEntryById(sqlite, entryId)
	const tag = await getTagById(sqlite, tagId)
	if(!entry || !tag) return 'not_found'
	if(await isTagCoveredByEntry(sqlite, entry, tagId)) return 'already_covered'

	entry.tags.push(tagId)
	await saveEntry(sqlite, entry)
	return 'ok'
}

/**
 * Removes tagId from entry.tags (only the direct link). Returns
 * 'not_found' | 'ok'. Idempotent if already absent.
 */
async function removeTagFromEntry(sqlite, entryId, tagId) {
	const entry = await getEntryById(sqlite, entryId)
	if(!entry) return 'not_found'

	entry.tags = entry.tags.filter((t) => t !== tagId)
	await saveEntry(sqlite, entry)
	return 'ok'
}

/**
 * Resolves an entry's direct tag ids into {id, label} pairs for the HTTP
 * response, so the client never has to fetch each tag individually.
 */
async function resolveEntryTags(sqlite, entry) {
	const result = []
	for(const tagId of entry.tags) {
		const tag = await getTagById(sqlite, tagId)
		if(tag) result.push({id: tag.id, label: tag.label})
	}
	return result
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
async function searchTags(sqlite, {q, notOnEntity, notHavingAsParent, notHavingAsChild} = {}) {
	let candidates = q ? await searchTag(sqlite, q) : await getAllTags(sqlite)

	if(notOnEntity) {
		const entry = await getEntryById(sqlite, notOnEntity)
		if(entry) {
			const filtered = []
			for(const t of candidates) {
				if(!await isTagCoveredByEntry(sqlite, entry, t.id)) filtered.push(t)
			}
			candidates = filtered
		}
	}
	if(Array.isArray(notHavingAsChild)) {
		const excluded = new Set()
		for(const tagId of notHavingAsChild) {
			for(const descendantId of await getDescendantIds(sqlite, tagId)) excluded.add(descendantId)
		}
		candidates = candidates.filter((t) => !excluded.has(t.id))
	}
	if(Array.isArray(notHavingAsParent)) {
		const excluded = new Set()
		for(const tagId of notHavingAsParent) {
			for(const ancestorId of await getAncestorIds(sqlite, tagId)) excluded.add(ancestorId)
		}
		candidates = candidates.filter((t) => !excluded.has(t.id))
	}

	return candidates
}

export {
	getTagData, canEditTag, renameTag, getOrCreateTag, addTagParent, removeTagParent,
	getParentTree, getChildTree, getEntriesForTag, isTagCoveredByEntry,
	addTagToEntry, removeTagFromEntry, resolveEntryTags, searchTags,
}
