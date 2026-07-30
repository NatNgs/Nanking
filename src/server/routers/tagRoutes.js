import express from 'express'
import requireAuthentication, { attachUserIfAuthenticated } from '../middleware/authenticate.js'
import {
	getTagData, canEditTag, renameTag, getOrCreateTag, addTagParent, removeTagParent,
	getParentTree, getChildTree, getEntriesForTag,
} from '../services/tagService.js'
import { getSqlite } from '../data/db.js'
import { getUserScores } from '../repository/userEntryRepository.js'
import { respondWithData, sendByResult } from './routeHelpers.js'
import { paginate } from '../lib/pagination.js'
import CONFIG from '../config/config.js'

const tagRoutes = express.Router()

const respondWithTagData = respondWithData(getTagData, 'Tag not found')

/**
 * Express middleware: 403s unless canEditTag(sqlite, req.user, tagId) is true
 * (Admin, or at least one quiz vote on an entry covered by this tag). Must run
 * after requireAuthentication (req.user set); the services below still
 * re-check not_found for a clean 404 if the tag turns out not to exist.
 */
function requireCanEditTag(tagIdParam = 'id') {
	return async (req, res, next) => {
		const sqlite = getSqlite()
		const topicId = CONFIG.DEFAULT_TOPIC
		if(!await canEditTag(sqlite, topicId, req.user, req.params[tagIdParam])) return res.status(403).send('Forbidden')
		next()
	}
}

// Authenticated

tagRoutes.put('/new', requireAuthentication, async (req, res) => {
	const sqlite = getSqlite()
	const topicId = CONFIG.DEFAULT_TOPIC
	const tag = await getOrCreateTag(sqlite, topicId, req.body.label)
	if(!tag) {
		return res.status(500).send('Unknown error')
	}
	return respondWithTagData(sqlite, topicId, tag.id, res)
})

tagRoutes.patch('/:id/label', requireAuthentication, requireCanEditTag(), async (req, res) => {
	const sqlite = getSqlite()
	const topicId = CONFIG.DEFAULT_TOPIC
	const result = await renameTag(sqlite, topicId, req.params.id, req.body.label)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Tag not found'},
		invalid: {status: 400, message: 'Invalid label'},
		conflict: {status: 409, message: 'A tag with this label already exists'},
	})) return
	return respondWithTagData(sqlite, topicId, req.params.id, res)
})

tagRoutes.post('/:id/parents', requireAuthentication, requireCanEditTag(), async (req, res) => {
	const sqlite = getSqlite()
	const topicId = CONFIG.DEFAULT_TOPIC
	const result = await addTagParent(sqlite, topicId, req.params.id, req.body.parentId)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Tag not found'},
		cycle: {status: 409, message: 'This would create an inheritance loop'},
		conflict: {status: 409, message: 'Already a parent'},
	})) return
	return respondWithTagData(sqlite, topicId, req.params.id, res)
})

tagRoutes.delete('/:id/parents/:parentId', requireAuthentication, requireCanEditTag(), async (req, res) => {
	const sqlite = getSqlite()
	const topicId = CONFIG.DEFAULT_TOPIC
	const result = await removeTagParent(sqlite, topicId, req.params.id, req.params.parentId)
	if(sendByResult(res, result, {not_found: {status: 404, message: 'Tag not found'}})) return
	return respondWithTagData(sqlite, topicId, req.params.id, res)
})

// Public, declared last

tagRoutes.get('/:id/entries', attachUserIfAuthenticated, async (req, res) => {
	const sqlite = getSqlite()
	const topicId = CONFIG.DEFAULT_TOPIC
	const data = await getTagData(sqlite, topicId, req.params.id)
	if(!data) return res.status(404).send('Tag not found')

	// req.user is loaded fresh per-request with an empty user.entries (see
	// authenticate.js) - load the last persisted scores before
	// getEntriesForTag() reads them to enrich each entry with the caller's
	// own score.
	if(req.user) req.user.entries = await getUserScores(sqlite, topicId, req.user.username)

	const {sort, order, page, limit} = req.query
	// already sorted (globalScore desc by default)
	const entries = await getEntriesForTag(sqlite, topicId, req.params.id, {user: req.user, sort, order})
	res.json(paginate(entries, {page, limit}))
})

tagRoutes.get('/:id/tree', async (req, res) => {
	const sqlite = getSqlite()
	const topicId = CONFIG.DEFAULT_TOPIC
	const data = await getTagData(sqlite, topicId, req.params.id)
	if(!data) return res.status(404).send('Tag not found')

	res.json({
		parents: await getParentTree(sqlite, topicId, req.params.id),
		children: await getChildTree(sqlite, topicId, req.params.id),
	})
})

tagRoutes.get('/:id', async (req, res) => respondWithTagData(getSqlite(), CONFIG.DEFAULT_TOPIC, req.params.id, res))

export default tagRoutes
