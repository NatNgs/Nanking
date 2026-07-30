import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { returnUserData } from '../services/userService.js'
import { computeUserScores } from '../services/scoresComputerService.js'
import { pickDualPair, pickSingleCandidate } from '../services/dualQuizService.js'
import { DirectQuiz, DualQuiz } from '../model/quizModel.js'
import { getEntryById } from '../repository/entriesRepository.js'
import { saveUser } from '../repository/userRepository.js'
import { getUserScores, saveUserScores } from '../repository/userEntryRepository.js'
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
	req.user.entries = await getUserScores(sqlite, req.user.username)
	const pair = await pickDualPair(sqlite, req.user)
	if(!pair) return res.status(409).send('Not enough scored entries for a dual quiz')
	res.json(pair)
})

/**
 * Suggests a single entry to face `fixed` (or picked freestanding if `fixed`
 * is omitted), for a single-side "Randomize" reroll. `exclude` typically
 * carries the entry currently on that side, so it doesn't come right back.
 * Falls back to entries the user never compared at all when it runs out of
 * scored candidates - see pickSingleCandidate().
 */
quizRouter.post('/dual/suggest', async (req, res) => {
	const sqlite = getSqlite()
	req.user.entries = await getUserScores(sqlite, req.user.username)
	const candidate = await pickSingleCandidate(sqlite, req.user, {
		fixedEntryId: req.body.fixed ?? null,
		excludeIds: req.body.exclude || [],
	})
	if(!candidate) return res.status(409).send('No entry available for a dual quiz')
	res.json(candidate)
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

/**
 * Recomputes req.user's scores until they stabilize (or 100 iterations,
 * whichever comes first), then persists the result - shared by both routes
 * below since a quiz mutation (add or remove) needs the exact same
 * recompute-then-save step afterwards. Always runs at least once, even with
 * zero or one quiz left: this is what rebuilds user.entries, purging the
 * score of whichever entry just lost its last vote (computeUserScores only
 * keeps entries still referenced by a live quiz).
 */
async function recomputeAndPersist(sqlite, user) {
	let scores = await getUserScores(sqlite, user.username)
	let totalChange = 1
	for(let it=0 ; it<100 && totalChange > 0.005 ; it++) {
		;({scores, totalChange} = computeUserScores(user.quiz, scores))
	}
	user.entries = scores
	await saveUserScores(sqlite, user.username, scores)
}

// Action to perform after a successful quiz
quizRouter.post('/{*type}', async (req, res) => {
	const sqlite = getSqlite()
	await recomputeAndPersist(sqlite, req.user)
	await returnUserData(sqlite, req, res)
})
quizRouter.delete('/{*type}', async (req, res) => {
	const sqlite = getSqlite()
	await recomputeAndPersist(sqlite, req.user)
	await returnUserData(sqlite, req, res)
})

export default quizRouter
