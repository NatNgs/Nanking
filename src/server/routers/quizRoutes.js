import express from 'express'
import authenticate from '../middleware/authenticate.js'
import { returnUserData } from '../services/userService.js'

const quizRouter = express.Router()
quizRouter.use(authenticate)

// TODO: implement pairwise comparison scoring (see doc/NankingServer.md)
quizRouter.post('/dual', (req, res) => {
	console.log('Quiz::dual', req.body)

	// Return user data
	returnUserData(req, res)
})

export default quizRouter
