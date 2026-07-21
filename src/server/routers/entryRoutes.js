import express from 'express'
import multer from 'multer'
import requireAuthentication, { attachUserIfAuthenticated } from '../middleware/authenticate.js'
import { getEntryData, renameEntry, updateEntryImage, deleteEntry } from '../services/entryService.js'
import { getEntryImageFilePath } from '../services/entryImageService.js'
import { addTagToEntry, removeTagFromEntry } from '../services/tagService.js'
import { respondWithData, sendByResult } from './routeHelpers.js'
import ENTRIES from '../data/entries.js'
import fs from 'fs'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_IMAGE_SIZE}})

const entryRoutes = express.Router()

const respondWithEntryData = respondWithData(getEntryData, 'Entry not found')

// Authenticated

entryRoutes.put('/new', requireAuthentication, (req, res) => {
	// Check if such entry already exists
	const entry = ENTRIES.getEntryByName(req.body.name, true)
	if(!entry) {
		return res.status(500).send('Unknown error')
	}
	return respondWithEntryData(entry.id, res, req.user)
})

entryRoutes.patch('/:id/name', requireAuthentication, (req, res) => {
	const result = renameEntry(req.params.id, req.body.name)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Entry not found'},
		invalid: {status: 400, message: 'Invalid name'},
		conflict: {status: 409, message: 'An entry with this name already exists'},
	})) return
	return respondWithEntryData(req.params.id, res, req.user)
})

entryRoutes.get('/:id/image.png', (req, res) => {
	// Find image related to this entry
	const entry = ENTRIES.getEntryById(req.params.id)
	if(!entry) return res.status(404).send('Entry not found')

	const entryImagePath = getEntryImageFilePath(entry.id)
	// Check if file exists
	if(!fs.existsSync(entryImagePath)) {
		// Return default image (assets/unknown.svg)
		return res.redirect('/assets/unknown.svg')
	}

	res.sendFile(entryImagePath)
})
entryRoutes.patch('/:id/image', requireAuthentication, (req, res, next) => {
	upload.single('image')(req, res, (err) => {
		if(err) return res.status(400).send('Invalid or too large image')
		next()
	})
}, async (req, res) => {
	if(!req.file) return res.status(400).send('Missing image')

	const result = await updateEntryImage(req.params.id, req.file.buffer)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Entry not found'},
		invalid: {status: 400, message: 'Invalid or too large image'},
	})) return
	return respondWithEntryData(req.params.id, res, req.user)
})

entryRoutes.delete('/:id', requireAuthentication, (req, res) => {
	const result = deleteEntry(req.params.id, req.user)
	if(sendByResult(res, result, {not_found: {status: 404, message: 'Entry not found'}})) return
	res.status(200).send('ok')
})

entryRoutes.post('/:id/tags', requireAuthentication, (req, res) => {
	const result = addTagToEntry(req.params.id, req.body.tagId)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Entry or tag not found'},
		already_covered: {status: 409, message: 'Entry is already covered by this tag'},
	})) return
	return respondWithEntryData(req.params.id, res, req.user)
})

entryRoutes.delete('/:id/tags/:tagId', requireAuthentication, (req, res) => {
	const result = removeTagFromEntry(req.params.id, req.params.tagId)
	if(sendByResult(res, result, {not_found: {status: 404, message: 'Entry not found'}})) return
	return respondWithEntryData(req.params.id, res, req.user)
})

// Public, declared last: attaches req.user only if a valid token is present

entryRoutes.get('/:id', attachUserIfAuthenticated, (req, res) => respondWithEntryData(req.params.id, res, req.user))

export default entryRoutes
