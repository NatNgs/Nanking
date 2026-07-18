import CONFIG from '../config/config.js'
import { ALL_USERS } from '../data/user.js'

let computationTimeoutHandler = null
function launchComputation() {
	if(computationTimeoutHandler) {
		clearTimeout(computationTimeoutHandler)
		computationTimeoutHandler = null
	}

	// 1: For every user, run computeUserScores
	for(const username in ALL_USERS) {
		computeUserScores(ALL_USERS[username])
	}

	// 2: Run computeGlobalScores
	computeGlobalScores()

	// Planify next computation
	computationTimeoutHandler = setTimeout(launchComputation, CONFIG.SCORE_COMPUTE_INTERVAL)
}

function computeUserScores(user) {
	const currScores = {}
	for(const entryId in user.entries) {
		if(user.entries[entryId]+1) { // remove invalid scores
			currScores[entryId] = user.entries[entryId]
		}
	}

	const entriesLists = {} // entryId: [quizScore1, quizScore2, ...]
	for(const q of user.quiz) {
		q.apply(currScores, entriesLists)
	}

	// Compute average for each entry, and set it to the user
	const averages = {}
	for(const entryId in entriesLists) {
		const entriesList = entriesLists[entryId]
		const average = entriesList.reduce((a, b) => a + b) / entriesList.length
		averages[entryId] = average
	}

	// Stretch scores from 0 (worst) to 1 (best)
	const min = Math.min(...Object.values(averages))
	const max = Math.max(...Object.values(averages))
	for(const entryId in averages) {
		user.entries[entryId] = (averages[entryId] - min) / (max - min)
	}
}

function computeGlobalScores() {
	// Average all users scores
	// TODO: where to store ?
}

export { launchComputation, computeUserScores }
