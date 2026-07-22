import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { returnUserData } from '../services/userService.js'
import { computeUserScores } from '../services/scoresComputerService.js'
import { pickDualPair } from '../services/dualQuizService.js'
import { DefaultValueQuiz, DualQuiz } from '../data/quiz.js'
import ENTRIES from '../data/entries.js'

const quizRouter = express.Router()
quizRouter.use(requireAuthentication)

quizRouter.get('/dual', (req, res) => {
	const pair = pickDualPair(req.user)
	if(!pair) return res.status(409).send('Not enough scored entries for a dual quiz')
	res.json(pair)
})

quizRouter.post('/default', (req, res, next) => {
	req.user.didQuiz(new DefaultValueQuiz(ENTRIES.getEntryById(req.body.entry), +req.body.score))
	next()
})
quizRouter.delete('/default', (req, res, next) => {
	req.user.removeQuiz(new DefaultValueQuiz(ENTRIES.getEntryById(req.body.entry)))
	next()
})

quizRouter.post('/dual', (req, res, next) => {
	// Add dual data to the user
	req.user.didQuiz(new DualQuiz(ENTRIES.getEntryById(req.body.neg), ENTRIES.getEntryById(req.body.pos), +req.body.value))
	next()
})
quizRouter.delete('/dual', (req, res, next) => {
	req.user.removeQuiz(new DualQuiz(ENTRIES.getEntryById(req.body.neg), ENTRIES.getEntryById(req.body.pos)))
	next()
})

// Action to perform after a successful quiz
quizRouter.post('/{*type}', (req, res) => {
	// Do computeUserScores until it stabilizes
	let totalUpdate = 1;
	for(let it=0 ; it<100 && totalUpdate > 0.005 ; it++)
		totalUpdate = computeUserScores(req.user)

	// Return updated user data
	returnUserData(req, res)
})
quizRouter.delete('/{*type}', (req, res) => {
	// Always run at least once, even with zero or one quiz left: this is what
	// rebuilds user.entries, purging the score of whichever entry just lost
	// its last vote (computeUserScores only keeps entries still referenced by
	// a live quiz - skipping this call here used to leave that entry's old
	// score behind forever).
	let totalUpdate = 1;
	for(let it=0 ; it<100 && totalUpdate > 0.005 ; it++)
		totalUpdate = computeUserScores(req.user)

	// Return updated user data
	returnUserData(req, res)
})

export default quizRouter
