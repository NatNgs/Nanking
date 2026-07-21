import ENTRIES from '../data/entries.js'
import { anyUserReferencesEntry } from '../data/user.js'
import { processImageUpload, saveEntryImage, deleteEntryImage } from './entryImageService.js'
import { resolveEntryTags } from './tagService.js'

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
	ENTRIES.save()
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
	ENTRIES.save()
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
	ENTRIES.save()
	return 'ok'
}

export { getEntryData, renameEntry, updateEntryImage, deleteEntry }
