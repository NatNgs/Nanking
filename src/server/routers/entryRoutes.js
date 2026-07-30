import express from 'express'
import multer from 'multer'
import requireAuthentication, { attachUserIfAuthenticated } from '../middleware/authenticate.js'
import { getEntryData, canEditEntry, renameEntry, updateEntryImage, deleteEntry } from '../services/entryService.js'
import { getEntryImageFilePath } from '../services/entryImageService.js'
import { addTagToEntry, removeTagFromEntry } from '../services/tagService.js'
import { getEntryByName, getEntryById } from '../repository/entriesRepository.js'
import { getSqlite } from '../data/db.js'
import { getUserScores } from '../repository/userEntryRepository.js'
import { respondWithData, sendByResult } from './routeHelpers.js'
import fs from 'fs'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_IMAGE_SIZE}})

const entryRoutes = express.Router()

const respondWithEntryData = respondWithData(getEntryData, 'Entry not found')

/**
 * req.user is loaded fresh from SQLite per-request (see authenticate.js) with
 * an empty user.entries - every route that serves getEntryData()'s userScore
 * field must load the last persisted scores first (see
 * scoresComputerService's design notes: never recomputed on read).
 */
async function withUserScores(sqlite, user) {
	if(user) user.entries = await getUserScores(sqlite, user.username)
	return user
}

/**
 * Express middleware factory: 403s unless canEditEntry(req.user, entry) is
 * true (Admin, or at least one quiz vote referencing this entry). Must run
 * after requireAuthentication (req.user set) and after the entry itself is
 * known to exist (services below still re-check not_found for a clean 404).
 */
function requireCanEditEntry(entryIdParam = 'id') {
	return async (req, res, next) => {
		const sqlite = getSqlite()
		const entry = await getEntryById(sqlite, req.params[entryIdParam])
		if(!entry) return res.status(404).send('Entry not found')
		if(!canEditEntry(req.user, entry)) return res.status(403).send('Forbidden')
		next()
	}
}

// Authenticated

entryRoutes.put('/new', requireAuthentication, async (req, res) => {
	if(!(req.body.name || '').trim()) return res.status(400).send('Invalid name')

	const sqlite = getSqlite()
	// Check if such entry already exists
	const entry = await getEntryByName(sqlite, req.body.name, true)
	if(!entry) {
		return res.status(500).send('Unknown error')
	}
	return respondWithEntryData(sqlite, entry.id, res, await withUserScores(sqlite, req.user))
})

entryRoutes.patch('/:id/name', requireAuthentication, requireCanEditEntry(), async (req, res) => {
	const sqlite = getSqlite()
	const result = await renameEntry(sqlite, req.params.id, req.body.name)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Entry not found'},
		invalid: {status: 400, message: 'Invalid name'},
		conflict: {status: 409, message: 'An entry with this name already exists'},
	})) return
	return respondWithEntryData(sqlite, req.params.id, res, await withUserScores(sqlite, req.user))
})

entryRoutes.get('/:id/image.png', async (req, res) => {
	const sqlite = getSqlite()
	// Find image related to this entry
	const entry = await getEntryById(sqlite, req.params.id)
	if(!entry) return res.status(404).send('Entry not found')

	const entryImagePath = getEntryImageFilePath(entry.id)
	// Check if file exists
	if(!fs.existsSync(entryImagePath)) {
		// Return default image (assets/unknown.svg)
		return res.redirect('/assets/unknown.svg')
	}

	res.sendFile(entryImagePath)
})
entryRoutes.patch('/:id/image', requireAuthentication, requireCanEditEntry(), (req, res, next) => {
	upload.single('image')(req, res, (err) => {
		if(err) return res.status(400).send('Invalid or too large image')
		next()
	})
}, async (req, res) => {
	if(!req.file) return res.status(400).send('Missing image')

	const sqlite = getSqlite()
	const result = await updateEntryImage(sqlite, req.params.id, req.file.buffer)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Entry not found'},
		invalid: {status: 400, message: 'Invalid or too large image'},
	})) return
	return respondWithEntryData(sqlite, req.params.id, res, await withUserScores(sqlite, req.user))
})

entryRoutes.delete('/:id', requireAuthentication, async (req, res) => {
	const sqlite = getSqlite()
	const result = await deleteEntry(sqlite, req.params.id, req.user)
	if(sendByResult(res, result, {not_found: {status: 404, message: 'Entry not found'}})) return
	res.status(200).send('ok')
})

entryRoutes.post('/:id/tags', requireAuthentication, requireCanEditEntry(), async (req, res) => {
	const sqlite = getSqlite()
	const result = await addTagToEntry(sqlite, req.params.id, req.body.tagId)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Entry or tag not found'},
		already_covered: {status: 409, message: 'Entry is already covered by this tag'},
	})) return
	return respondWithEntryData(sqlite, req.params.id, res, await withUserScores(sqlite, req.user))
})

entryRoutes.delete('/:id/tags/:tagId', requireAuthentication, requireCanEditEntry(), async (req, res) => {
	const sqlite = getSqlite()
	const result = await removeTagFromEntry(sqlite, req.params.id, req.params.tagId)
	if(sendByResult(res, result, {not_found: {status: 404, message: 'Entry not found'}})) return
	return respondWithEntryData(sqlite, req.params.id, res, await withUserScores(sqlite, req.user))
})

// Public, declared last: attaches req.user only if a valid session is present

entryRoutes.get('/:id', attachUserIfAuthenticated, async (req, res) => {
	const sqlite = getSqlite()
	return respondWithEntryData(sqlite, req.params.id, res, await withUserScores(sqlite, req.user))
})

export default entryRoutes
