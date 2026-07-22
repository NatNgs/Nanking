import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { apiLimiter, publicProfileLimiter } from '../middleware/rateLimit.js'
import { returnUserData, setEntryScore, returnPublicUserData as getPublicUserData, getUserEntities, getUserQuizPaginated, deleteAccount } from '../services/userService.js'
import ACCOUNTS from '../data/accounts.js'
import ENTRIES from '../data/entries.js'

const userRouter = express.Router()

userRouter.get('/me', requireAuthentication, apiLimiter, (req, res) => {
	returnUserData(req, res)
})
userRouter.get('/me/entities', requireAuthentication, apiLimiter, (req, res) => {
	const {sort, order, page, limit} = req.query
	res.json(getUserEntities(req.user, {sort, order, page, limit}))
})
userRouter.get('/me/quiz', requireAuthentication, apiLimiter, (req, res) => {
	const {type, page, limit} = req.query
	res.json(getUserQuizPaginated(req.user, {type, page, limit}))
})
userRouter.delete('/me', requireAuthentication, apiLimiter, (req, res) => {
	if(!ACCOUNTS.verifyPassword(req.user.username, req.body.pwd)) {
		console.warn(req.originalUrl, '=> 401 (Wrong password)')
		return res.status(401).send('Wrong password')
	}
	deleteAccount(req.user.username)
	res.status(200).send('ok')
})

// Public route, declared last so its generic :username pattern never shadows /me or /entry
userRouter.get('/:username', publicProfileLimiter, (req, res) => {
	const {sort, order, page, limit} = req.query
	const data = getPublicUserData(req.params.username, {sort, order, page, limit})
	if(!data) {
		console.warn(req.originalUrl, '=> 404 (Unknown user)')
		return res.status(404).send('User not found')
	}
	res.json(data)
})

export default userRouter
