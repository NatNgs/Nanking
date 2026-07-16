import ACCOUNTS from '../data/accounts.js'
import express, { 'static' as express_static } from 'express'
import { resolve } from 'path'
import { getUser } from '../data/user.js'
import DB from '../data/db.js'
const __project = resolve(import.meta.dirname + '/../../..')

function authenticate(req, res, next) {
	const token = req.headers.authorization
	const user = ACCOUNTS.check_token(token)
	if(!user) {
		console.warn(req.originalUrl, '=> 401 (Unauthorized)')
		res.status(401).send('Unauthorized')
		return
	}
	const newToken = ACCOUNTS.refresh_token(user)
	res.setHeader('authorization', newToken)
	req.user = getUser(user)
	next()
}

const userRouter = express.Router()
userRouter.use(authenticate)

function returnUserData(req, res) {
	// Return user data
	res.json({username: req.user.username, user_scores: req.user.getUserList()})
}
userRouter.get('/me', returnUserData)
userRouter.put('/entry', (req, res) => {
	// Check if the score is within bounds (0 to 1)
	const score = +req.body.score
	if(score < 0 || score > 1) {
		console.warn(req.originalUrl, `=> 400 (Invalid score: ${req.body.score})`)
		return res.status(400).send('Invalid score')
	}

	req.user.setEntryScore(req.body.entry, score)
	res.json({user_scores: req.user.getUserList()})
})


export default userRouter
export { authenticate, returnUserData }
