import ENTRIES from '../data/entries.js'
import { anyUserReferencesEntry } from '../data/user.js'
import { processImageUpload, saveEntryImage, deleteEntryImage } from './entryImageService.js'
import { resolveEntryTags } from './tagService.js'
import { paginate, compareBy } from '../lib/pagination.js'
import { saveEntries } from './persistenceService.js'

/**
 * Serializes an entry for the HTTP response. Includes the current user's
 * score on this entry when `user` is authenticated and has one.
 */
function getEntryData(id, user=null) {
	const entry = ENTRIES.getEntryById(id)
	if(!entry) return null

	const data = {
		id: entry.id,
		name: entry.name,
		image: entry.image,
		globalScore: entry.globalScore,
		tags: resolveEntryTags(entry),
	}
	if(user && user.entries.hasOwnProperty(entry.id)) {
		data.userScore = user.entries[entry.id]
	}
	return data
}

/**
 * Renames an entry after checking no other entry already uses this name
 * (case-insensitive). Returns 'not_found' | 'invalid' | 'conflict' | 'ok'.
 */
function renameEntry(id, newName) {
	const entry = ENTRIES.getEntryById(id)
	if(!entry) return 'not_found'

	const trimmed = (newName || '').trim()
	if(!trimmed) return 'invalid'
	if(ENTRIES.getEntryByNameIgnoreCase(trimmed, id)) return 'conflict'

	entry.name = trimmed
	saveEntries().catch((err) => console.error('saveEntries() failed:', err))
	return 'ok'
}

/**
 * Validates and stores a new image for an entry, replacing the previous
 * custom image if any. Returns 'not_found' | 'invalid' | 'ok'.
 */
async function updateEntryImage(id, fileBuffer) {
	const entry = ENTRIES.getEntryById(id)
	if(!entry) return 'not_found'

	let pngBuffer
	try {
		pngBuffer = await processImageUpload(fileBuffer)
	} catch {
		return 'invalid'
	}

	deleteEntryImage(entry)
	entry.image = await saveEntryImage(entry.id, pngBuffer)
	saveEntries().catch((err) => console.error('saveEntries() failed:', err))
	return 'ok'
}

/**
 * Removes `user`'s own votes and score on the entry. The entry itself (and its
 * image) is only permanently deleted once no other user has a vote left on it.
 * Returns 'not_found' | 'ok'.
 */
function deleteEntry(id, user) {
	const entry = ENTRIES.getEntryById(id)
	if(!entry) return 'not_found'

	user.removeAllReferencesToEntry(entry)

	if(!anyUserReferencesEntry(entry)) {
		deleteEntryImage(entry)
		ENTRIES.deleteEntry(id)
	}
	saveEntries().catch((err) => console.error('saveEntries() failed:', err))
	return 'ok'
}

/**
 * Paginated entry listing, backing GET /api/entries. With `q`, delegates to
 * ENTRIES.searchEntry (fuzzy match, already sorted by name-length relevance
 * and capped to 32 results — a relevance cap distinct from pagination, left
 * untouched) and paginates that result. Without `q`, lists every entry's
 * global score, sorted by `sort` ('score' desc by default, or 'label' asc),
 * then paginated.
 */
function listEntries({q, sort, order, page, limit} = {}) {
	if(q) {
		const candidates = ENTRIES.searchEntry(q).map((e) => ({id: e.id, label: e.name, image: e.image}))
		return paginate(candidates, {page, limit})
	}

	const scores = ENTRIES.getGlobalScores()
	const list = Object.entries(scores).map(([id, score]) => {
		const entry = ENTRIES.getEntryById(id)
		return {id: entry.id, label: entry.name, score, image: entry.image}
	})
	const cmp = sort === 'label' ? compareBy((e) => e.label, order || 'asc') : compareBy((e) => e.score, order || 'desc')
	list.sort(cmp)
	return paginate(list, {page, limit})
}

export { getEntryData, renameEntry, updateEntryImage, deleteEntry, listEntries }
