import {
	getEntryById, getEntryByNameIgnoreCase, searchEntry, getAllEntriesWithScores, saveEntry, deleteEntry as deleteEntryFromDb,
} from '../repository/entriesRepository.js'
import { anyUserReferencesEntry, removeUserReferencesToEntry } from '../repository/userRepository.js'
import { processImageUpload, saveEntryImage, deleteEntryImage } from './entryImageService.js'
import { resolveEntryTags } from './tagService.js'
import { paginate, compareBy } from '../lib/pagination.js'

/**
 * Serializes an entry for the HTTP response. Includes the current user's
 * score on this entry when `user` is authenticated and has one, and whether
 * they are an Admin (who can edit any entry regardless of having a score on
 * it - see EntryPage.jsx).
 */
async function getEntryData(sqlite, topicId, id, user=null) {
	const entry = await getEntryById(sqlite, topicId, id)
	if(!entry) return null

	const data = {
		id: entry.id,
		name: entry.name,
		image: entry.image,
		globalScore: entry.globalScore,
		tags: await resolveEntryTags(sqlite, topicId, entry),
		isAdmin: !!user?.isAdmin,
	}
	if(user && Object.hasOwn(user.entries, entry.id)) {
		data.userScore = user.entries[entry.id]
	}
	return data
}

/**
 * True if `user` is allowed to mutate `entry` (rename, change image, add/remove
 * tags): either an Admin, or someone who has at least one quiz vote (direct or
 * dual) referencing this entry. Anonymous callers are never allowed.
 */
function canEditEntry(user, entry) {
	if(!user) return false
	if(user.isAdmin) return true
	return user.quiz.some((q) => q.referencesEntry(entry))
}

/**
 * Renames an entry after checking no other entry already uses this name
 * (case-insensitive). Returns 'not_found' | 'invalid' | 'conflict' | 'ok'.
 */
async function renameEntry(sqlite, topicId, id, newName) {
	const entry = await getEntryById(sqlite, topicId, id)
	if(!entry) return 'not_found'

	const trimmed = (newName || '').trim()
	if(!trimmed) return 'invalid'
	if(await getEntryByNameIgnoreCase(sqlite, topicId, trimmed, id)) return 'conflict'

	entry.name = trimmed
	await saveEntry(sqlite, topicId, entry)
	return 'ok'
}

/**
 * Validates and stores a new image for an entry, replacing the previous
 * custom image if any. Returns 'not_found' | 'invalid' | 'ok'.
 */
async function updateEntryImage(sqlite, topicId, id, fileBuffer) {
	const entry = await getEntryById(sqlite, topicId, id)
	if(!entry) return 'not_found'

	let pngBuffer
	try {
		pngBuffer = await processImageUpload(fileBuffer)
	} catch {
		return 'invalid'
	}

	deleteEntryImage(entry)
	entry.image = await saveEntryImage(entry.id, pngBuffer)
	await saveEntry(sqlite, topicId, entry)
	return 'ok'
}

/**
 * Removes `user`'s own votes and score on the entry. The entry itself (and its
 * image) is only permanently deleted once no other user has a vote left on it.
 * Returns 'not_found' | 'ok'.
 */
async function deleteEntry(sqlite, topicId, id, user) {
	const entry = await getEntryById(sqlite, topicId, id)
	if(!entry) return 'not_found'

	await removeUserReferencesToEntry(sqlite, topicId, user.username, entry.id)

	if(!await anyUserReferencesEntry(sqlite, topicId, entry.id)) {
		deleteEntryImage(entry)
		await deleteEntryFromDb(sqlite, topicId, id)
	}
	return 'ok'
}

/**
 * Paginated entry listing, backing GET /api/entries. With `q`, delegates to
 * searchEntry (fuzzy match, already sorted by name-length relevance and
 * capped to 32 results — a relevance cap distinct from pagination, left
 * untouched) and paginates that result. Without `q`, lists every entry's
 * global score, sorted by `sort` ('score' desc by default, or 'label' asc),
 * then paginated.
 */
async function listEntries(sqlite, topicId, {q, sort, order, page, limit} = {}) {
	if(q) {
		const candidates = (await searchEntry(sqlite, topicId, q)).map(
			(e) => ({id: e.id, label: e.name, image: e.image})
		)
		return paginate(candidates, {page, limit})
	}

	const entries = await getAllEntriesWithScores(sqlite, topicId)
	const list = entries.map((entry) => ({id: entry.id, label: entry.name, score: entry.globalScore, image: entry.image}))
	const cmp = sort === 'label' ? compareBy((e) => e.label, order || 'asc') : compareBy((e) => e.score, order || 'desc')
	list.sort(cmp)
	return paginate(list, {page, limit})
}

export { getEntryData, canEditEntry, renameEntry, updateEntryImage, deleteEntry, listEntries }
