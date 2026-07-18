import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { returnUserData } from '../services/userService.js'
import { computeUserScores } from '../services/scoresComputerService.js'
import { DefaultValueQuiz, DualQuiz } from '../data/quiz.js'
import ENTRIES from '../data/entries.js'

const quizRouter = express.Router()
quizRouter.use(requireAuthentication)

quizRouter.post('/default', (req, res, next) => {
	req.user.didQuiz(new DefaultValueQuiz(ENTRIES.getEntryById(req.body.entry), +req.body.score))
	next()
})

quizRouter.post('/dual', (req, res, next) => {
	// Add dual data to the user
	req.user.didQuiz(new DualQuiz(ENTRIES.getEntryById(req.body.neg), ENTRIES.getEntryById(req.body.pos), +req.body.value))
	next()
})

// Action to perform after a successful quiz
quizRouter.post('/{*type}', (req, res) => {
	// Do computeUserScores once
	computeUserScores(req.user)

	// Return updated user data
	returnUserData(req, res)
})

export default quizRouter
