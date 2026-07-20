import CONFIG from '../config/config.js'
import { ALL_USERS } from '../data/user.js'
import ENTRIES from '../data/entries.js'

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
		if(user.entries[entryId] || user.entries[entryId] === 0) { // remove invalid scores (NaN, null, undefined)
			currScores[entryId] = user.entries[entryId]
		}
	}

	const entriesLists = {} // entryId: [quizScore1, quizScore2, ...]
	for(const q of user.quiz) {
		q.apply(currScores, entriesLists)
	}

	// Append globalScore to every enty
	for(const entryId in entriesLists) {
		entriesLists[entryId].push(ENTRIES.entries[entryId].globalScore)
	}

	// Compute average for each entry, and set it to the user
	for(const entryId in entriesLists) {
		const entriesList = entriesLists[entryId]
		const average = entriesList.reduce((a, b) => a + b) / entriesList.length
		user.entries[entryId] = average
	}
}

function computeGlobalScores() {
	// Average all users scores
	const allScores = {} // item: [user1Score, user2Score, ...]

	// Get current entries scores
	for(const entryId in ENTRIES.entries) {
		allScores[entryId] = [ENTRIES.entries[entryId].globalScore]
	}

	for(const username in ALL_USERS) {
		const user = ALL_USERS[username]
		for(const entryId in user.entries) {
			if(!allScores[entryId]) allScores[entryId] = []
			allScores[entryId].push(user.entries[entryId])
		}
	}

	// Average allScores and set entries new globalScores
	const averages = {}
	for(const entryId in allScores) {
		// If an entry has no user score, remove it
		if(allScores[entryId].length <= 1) {
			delete allScores[entryId]
			delete ENTRIES.entries[entryId]
			continue
		}

		averages[entryId] = allScores[entryId].reduce((a, b) => a + b) / allScores[entryId].length
	}

	// Stretch scores from 0 (worst) to 1 (best). With no variance to stretch
	// (a single entry, or every entry tied), fall back to the neutral 0.5
	// rather than dividing by zero.
	const min = Math.min(...Object.values(averages))
	const max = Math.max(...Object.values(averages))
	for(const entryId in averages) {
		ENTRIES.entries[entryId].globalScore = max === min ? 0.5 : (averages[entryId] - min) / (max - min)
	}
}

export { launchComputation, computeUserScores, computeGlobalScores }
