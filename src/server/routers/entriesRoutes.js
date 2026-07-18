import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import ENTRIES from '../data/entries.js'


const entriesRoutes = express.Router()
entriesRoutes.use(requireAuthentication)

const respondWithEntryData = (id, res) => {
	const entry = ENTRIES.getEntryById(id)
	if(!entry) return res.status(404).send('Entry not found')

	res.json({
		id: entry.id,
		name: entry.name
	})
}
entriesRoutes.put('/new', (req, res) => {
	// Check if such entry already exists
	const entry = ENTRIES.getEntryByName(req.body.name, true)
	if(!entry) {
		return res.status(500).send('Unknown error')
	}
	return respondWithEntryData(entry.id, res)
})
entriesRoutes.get('/:id', (req, res) => respondWithEntryData(req.params.id, res))

export default entriesRoutes
