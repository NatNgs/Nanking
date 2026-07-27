import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { returnUserData } from '../services/userService.js'
import { computeUserScores } from '../services/scoresComputerService.js'
import { pickDualPair } from '../services/dualQuizService.js'
import { DirectQuiz, DualQuiz } from '../data/quizModel.js'
import { getEntryById } from '../data/entriesRepository.js'
import { saveUser } from '../data/userRepository.js'
import { getSqlite } from '../data/db.js'

const quizRouter = express.Router()
quizRouter.use(requireAuthentication)

/**
 * Parses `raw` as a finite number, or responds 400 and returns undefined.
 * Guards DirectQuiz/DualQuiz's own range checks (value < min || value > max),
 * which silently let a NaN through since every comparison against NaN is
 * false.
 */
function parseFiniteOr400(raw, res, fieldName) {
	const value = +raw
	if(!Number.isFinite(value)) {
		res.status(400).send(`Invalid ${fieldName}`)
		return undefined
	}
	return value
}

quizRouter.get('/dual', async (req, res) => {
	const sqlite = getSqlite()
	await computeUserScores(sqlite, req.user)
	const pair = await pickDualPair(sqlite, req.user)
	if(!pair) return res.status(409).send('Not enough scored entries for a dual quiz')
	res.json(pair)
})

quizRouter.post('/direct', async (req, res, next) => {
	const sqlite = getSqlite()
	const entry = await getEntryById(sqlite, req.body.entry)
	if(!entry) return res.status(404).send('Entry not found')

	const score = parseFiniteOr400(req.body.score, res, 'score')
	if(score === undefined) return
	try {
		req.user.didQuiz(new DirectQuiz(entry, score))
	} catch {
		return res.status(400).send('Invalid score')
	}
	await saveUser(sqlite, req.user)
	next()
})
quizRouter.delete('/direct', async (req, res, next) => {
	const sqlite = getSqlite()
	const entry = await getEntryById(sqlite, req.body.entry)
	if(!entry) return res.status(404).send('Entry not found')

	req.user.removeQuiz(new DirectQuiz(entry))
	await saveUser(sqlite, req.user)
	next()
})

quizRouter.post('/dual', async (req, res, next) => {
	const sqlite = getSqlite()
	const neg = await getEntryById(sqlite, req.body.neg)
	const pos = await getEntryById(sqlite, req.body.pos)
	if(!neg || !pos) return res.status(404).send('Entry not found')

	const value = parseFiniteOr400(req.body.value, res, 'value')
	if(value === undefined) return
	try {
		// Add dual data to the user
		req.user.didQuiz(new DualQuiz(neg, pos, value))
	} catch {
		return res.status(400).send('Invalid value')
	}
	await saveUser(sqlite, req.user)
	next()
})
quizRouter.delete('/dual', async (req, res, next) => {
	const sqlite = getSqlite()
	const neg = await getEntryById(sqlite, req.body.neg)
	const pos = await getEntryById(sqlite, req.body.pos)
	if(!neg || !pos) return res.status(404).send('Entry not found')

	req.user.removeQuiz(new DualQuiz(neg, pos))
	await saveUser(sqlite, req.user)
	next()
})

// Action to perform after a successful quiz
quizRouter.post('/{*type}', async (req, res) => {
	const sqlite = getSqlite()
	// Do computeUserScores until it stabilizes
	let totalUpdate = 1
	for(let it=0 ; it<100 && totalUpdate > 0.005 ; it++)
		totalUpdate = await computeUserScores(sqlite, req.user)

	// Return updated user data
	await returnUserData(sqlite, req, res)
})
quizRouter.delete('/{*type}', async (req, res) => {
	const sqlite = getSqlite()
	// Always run at least once, even with zero or one quiz left: this is what
	// rebuilds user.entries, purging the score of whichever entry just lost
	// its last vote (computeUserScores only keeps entries still referenced by
	// a live quiz - skipping this call here used to leave that entry's old
	// score behind forever).
	let totalUpdate = 1
	for(let it=0 ; it<100 && totalUpdate > 0.005 ; it++)
		totalUpdate = await computeUserScores(sqlite, req.user)

	// Return updated user data
	await returnUserData(sqlite, req, res)
})

export default quizRouter
