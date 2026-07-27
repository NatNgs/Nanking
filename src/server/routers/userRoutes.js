import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { apiLimiter, publicProfileLimiter } from '../middleware/rateLimit.js'
import {
	returnUserData, returnPublicUserData as getPublicUserData,
	getUserEntities, getUserQuizPaginated, deleteAccount,
} from '../services/userService.js'
import { verifyPassword } from '../data/accountsRepository.js'
import { getSqlite } from '../data/db.js'

const userRouter = express.Router()

userRouter.get('/me', requireAuthentication, apiLimiter, async (req, res) => {
	await returnUserData(getSqlite(), req, res)
})
userRouter.get('/me/entities', requireAuthentication, apiLimiter, async (req, res) => {
	const {sort, order, page, limit} = req.query
	res.json(await getUserEntities(getSqlite(), req.user, {sort, order, page, limit}))
})
userRouter.get('/me/quiz', requireAuthentication, apiLimiter, async (req, res) => {
	const {type, page, limit} = req.query
	res.json(await getUserQuizPaginated(getSqlite(), req.user, {type, page, limit}))
})
userRouter.delete('/me', requireAuthentication, apiLimiter, async (req, res) => {
	const sqlite = getSqlite()
	// 403 (Forbidden), not 401: the session itself is valid (requireAuthentication
	// already passed) - this rejects the *action*, not the authentication. Keeping
	// this off 401 also matters client-side (see useApi.js's apiFetch()): a 401 is
	// always treated as "session expired, log out", which a wrong-password retry
	// here must not trigger.
	if(!await verifyPassword(sqlite, req.user.username, req.body.pwd)) {
		console.warn(req.originalUrl, '=> 403 (Wrong password)')
		return res.status(403).send('Wrong password')
	}
	await deleteAccount(sqlite, req.user.username)
	req.session.destroy((err) => {
		if(err) console.error(req.originalUrl, 'session.destroy() failed after account deletion:', err)
		res.clearCookie('nanking.sid')
		res.status(200).send('ok')
	})
})

// Public route, declared last so its generic :username pattern never shadows /me or /entry
userRouter.get('/:username', publicProfileLimiter, async (req, res) => {
	const {sort, order, page, limit} = req.query
	const data = await getPublicUserData(getSqlite(), req.params.username, {sort, order, page, limit})
	if(!data) {
		console.warn(req.originalUrl, '=> 404 (Unknown user)')
		return res.status(404).send('User not found')
	}
	res.json(data)
})

export default userRouter
