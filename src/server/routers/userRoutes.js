import express from 'express'
import authenticate from '../middleware/authenticate.js'
import { returnUserData, setEntryScore } from '../services/userService.js'

const userRouter = express.Router()
userRouter.use(authenticate)

userRouter.get('/me', returnUserData)
userRouter.put('/entry', (req, res) => {
	const score = +req.body.score
	if(!setEntryScore(req.user, req.body.entry, score)) {
		console.warn(req.originalUrl, `=> 400 (Invalid score: ${req.body.score})`)
		return res.status(400).send('Invalid score')
	}

	res.json({user_scores: req.user.getUserList()})
})

export default userRouter
