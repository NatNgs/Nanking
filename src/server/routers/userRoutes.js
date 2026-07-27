import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { apiLimiter, publicProfileLimiter } from '../middleware/rateLimit.js'
import { returnUserData, returnPublicUserData as getPublicUserData, getUserEntities, getUserQuizPaginated, deleteAccount } from '../services/userService.js'
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
	// 403 (Forbidden), not 401: the session itself is valid (requireAuthentication
	// already passed) - this rejects the *action*, not the authentication. Keeping
	// this off 401 also matters client-side (see useApi.js's apiFetch()): a 401 is
	// always treated as "session expired, log out", which a wrong-password retry
	// here must not trigger.
	if(!ACCOUNTS.verifyPassword(req.user.username, req.body.pwd)) {
		console.warn(req.originalUrl, '=> 403 (Wrong password)')
		return res.status(403).send('Wrong password')
	}
	deleteAccount(req.user.username)
	req.session.destroy((err) => {
		if(err) console.error(req.originalUrl, 'session.destroy() failed after account deletion:', err)
		res.clearCookie('nanking.sid')
		res.status(200).send('ok')
	})
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
