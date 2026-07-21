import express from 'express'
import multer from 'multer'
import requireAuthentication, { attachUserIfAuthenticated } from '../middleware/authenticate.js'
import { getEntryData, renameEntry, updateEntryImage, deleteEntry } from '../services/entryService.js'
import ENTRIES from '../data/entries.js'
import CONFIG from '../config/config.js'
import fs from 'fs'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_IMAGE_SIZE}})

const entryRoutes = express.Router()

const respondWithEntryData = (id, res, user=null) => {
	const data = getEntryData(id, user)
	if(!data) return res.status(404).send('Entry not found')
	res.json(data)
}

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
	if(result === 'not_found') return res.status(404).send('Entry not found')
	if(result === 'invalid') return res.status(400).send('Invalid name')
	if(result === 'conflict') return res.status(409).send('An entry with this name already exists')
	return respondWithEntryData(req.params.id, res, req.user)
})

entryRoutes.get('/:id/image.png', (req, res) => {
	// Find image related to this entry
	const entry = ENTRIES.getEntryById(req.params.id)
	if(!entry) return next()

	const entryImagePath = CONFIG.DATA_DIR + '/entryImages/' + entry.id.replace(':', '/') + '.png'
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
	if(result === 'not_found') return res.status(404).send('Entry not found')
	if(result === 'invalid') return res.status(400).send('Invalid or too large image')
	return respondWithEntryData(req.params.id, res, req.user)
})

entryRoutes.delete('/:id', requireAuthentication, (req, res) => {
	const result = deleteEntry(req.params.id, req.user)
	if(result === 'not_found') return res.status(404).send('Entry not found')
	res.status(200).send('ok')
})

// Public, declared last: attaches req.user only if a valid token is present

entryRoutes.get('/:id', attachUserIfAuthenticated, (req, res) => respondWithEntryData(req.params.id, res, req.user))

export default entryRoutes
