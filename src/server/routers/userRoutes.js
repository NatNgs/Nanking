import express from 'express'
import authenticate from '../middleware/authenticate.js'
import { apiLimiter, publicProfileLimiter } from '../middleware/rateLimit.js'
import { returnUserData, setEntryScore, returnPublicUserData, deleteAccount } from '../services/userService.js'
import ACCOUNTS from '../data/accounts.js'

const userRouter = express.Router()

userRouter.get('/me', authenticate, apiLimiter, returnUserData)
userRouter.put('/entry', authenticate, apiLimiter, (req, res) => {
	const score = +req.body.score
	if(!setEntryScore(req.user, req.body.entry, score)) {
		console.warn(req.originalUrl, `=> 400 (Invalid score: ${req.body.score})`)
		return res.status(400).send('Invalid score')
	}

	res.json({user_scores: req.user.getUserList()})
})
userRouter.delete('/me', authenticate, apiLimiter, (req, res) => {
	if(!ACCOUNTS.verifyPassword(req.user.username, req.body.pwd)) {
		console.warn(req.originalUrl, '=> 401 (Wrong password)')
		return res.status(401).send('Wrong password')
	}
	deleteAccount(req.user.username)
	res.status(200).send('ok')
})

// Public route, declared last so its generic :username pattern never shadows /me or /entry
userRouter.get('/:username', publicProfileLimiter, (req, res) => {
	const data = returnPublicUserData(req.params.username)
	if(!data) {
		console.warn(req.originalUrl, '=> 404 (Unknown user)')
		return res.status(404).send('User not found')
	}
	res.json(data)
})

export default userRouter
