import express from 'express'
import requireAuthentication, { attachUserIfAuthenticated } from '../middleware/authenticate.js'
import {
	getTagData, renameTag, getOrCreateTag, addTagParent, removeTagParent,
	getParentTree, getChildTree, getEntriesForTag,
} from '../services/tagService.js'
import { respondWithData, sendByResult } from './routeHelpers.js'
import { paginate } from '../lib/pagination.js'

const tagRoutes = express.Router()

const respondWithTagData = respondWithData(getTagData, 'Tag not found')

// Authenticated

tagRoutes.put('/new', requireAuthentication, (req, res) => {
	const tag = getOrCreateTag(req.body.label)
	if(!tag) {
		return res.status(500).send('Unknown error')
	}
	return respondWithTagData(tag.id, res)
})

tagRoutes.patch('/:id/label', requireAuthentication, (req, res) => {
	const result = renameTag(req.params.id, req.body.label)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Tag not found'},
		invalid: {status: 400, message: 'Invalid label'},
		conflict: {status: 409, message: 'A tag with this label already exists'},
	})) return
	return respondWithTagData(req.params.id, res)
})

tagRoutes.post('/:id/parents', requireAuthentication, (req, res) => {
	const result = addTagParent(req.params.id, req.body.parentId)
	if(sendByResult(res, result, {
		not_found: {status: 404, message: 'Tag not found'},
		cycle: {status: 409, message: 'This would create an inheritance loop'},
		conflict: {status: 409, message: 'Already a parent'},
	})) return
	return respondWithTagData(req.params.id, res)
})

tagRoutes.delete('/:id/parents/:parentId', requireAuthentication, (req, res) => {
	const result = removeTagParent(req.params.id, req.params.parentId)
	if(sendByResult(res, result, {not_found: {status: 404, message: 'Tag not found'}})) return
	return respondWithTagData(req.params.id, res)
})

// Public, declared last

tagRoutes.get('/:id/entries', attachUserIfAuthenticated, (req, res) => {
	const data = getTagData(req.params.id)
	if(!data) return res.status(404).send('Tag not found')

	const {sort, order, page, limit} = req.query
	const entries = getEntriesForTag(req.params.id, {user: req.user, sort, order}) // already sorted (globalScore desc by default)
	res.json(paginate(entries, {page, limit}))
})

tagRoutes.get('/:id/tree', (req, res) => {
	const data = getTagData(req.params.id)
	if(!data) return res.status(404).send('Tag not found')

	res.json({parents: getParentTree(req.params.id), children: getChildTree(req.params.id)})
})

tagRoutes.get('/:id', (req, res) => respondWithTagData(req.params.id, res))

export default tagRoutes
