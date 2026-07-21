import CONFIG from '../config/config.js'
import { ALL_USERS } from '../data/user.js'
import ENTRIES from '../data/entries.js'
import TAGS from '../data/tags.js'

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

	// Append the average of this entry's direct tags' current user score (a
	// single extra value), when it has at least one tag with a known user score.
	for(const entryId in entriesLists) {
		const entry = ENTRIES.entries[entryId]
		const tagScores = entry.tags
			.map((tagId) => user.tags[tagId])
			.filter((s) => s || s === 0)
		if(tagScores.length) {
			entriesLists[entryId].push(tagScores.reduce((a, b) => a + b) / tagScores.length)
		}
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

	computeUserTagScores(user)
}

/**
 * Recomputes user.tags, walking the tag hierarchy from the most specific tags
 * (no derived children) up to the most generic ones. A tag's user score is the
 * average of the user's scores on every entry directly tagged with it, plus
 * the (already computed) user scores of its direct children. A tag with no
 * scorable entry/child is left untouched (stays absent: this user simply
 * hasn't reached it through their vote history yet — no 0.5 fallback).
 */
function computeUserTagScores(user) {
	const order = TAGS.topologicalOrder()
	for(const tagId of order) {
		const tag = TAGS.tags[tagId]
		const values = []

		for(const entryId in ENTRIES.entries) {
			const entry = ENTRIES.entries[entryId]
			if(entry.tags.includes(tagId) && user.entries.hasOwnProperty(entryId)) {
				const v = user.entries[entryId]
				if(v || v === 0) values.push(v)
			}
		}
		for(const child of TAGS.getDirectChildren(tagId)) {
			const v = user.tags[child.id]
			if(v || v === 0) values.push(v)
		}

		if(values.length) {
			user.tags[tagId] = values.reduce((a, b) => a + b) / values.length
		}
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

	// Append the average of this entry's direct tags' current global score (a
	// single extra value), when it has at least one tag with a known score.
	for(const entryId in allScores) {
		const entry = ENTRIES.entries[entryId]
		if(!entry) continue
		const tagScores = entry.tags
			.map((tagId) => TAGS.tags[tagId]?.score)
			.filter((s) => s || s === 0)
		if(tagScores.length) {
			allScores[entryId].push(tagScores.reduce((a, b) => a + b) / tagScores.length)
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

	computeGlobalTagScores()
}

/**
 * Recomputes tag.score (global), walking the tag hierarchy from the most
 * specific tags up to the most generic ones, same principle as
 * computeUserTagScores but using entry.globalScore / childTag.score. Unlike
 * user.tags, tag.score always has a value (default 0.5): with no scorable
 * entry/child this cycle, it is simply left unchanged (no reset, no division
 * by zero). No min-max stretch is applied to tag scores.
 */
function computeGlobalTagScores() {
	const order = TAGS.topologicalOrder()
	for(const tagId of order) {
		const tag = TAGS.tags[tagId]
		const values = []

		for(const entryId in ENTRIES.entries) {
			const entry = ENTRIES.entries[entryId]
			if(entry.tags.includes(tagId)) values.push(entry.globalScore)
		}
		for(const child of TAGS.getDirectChildren(tagId)) {
			values.push(child.score)
		}

		if(values.length) {
			tag.score = values.reduce((a, b) => a + b) / values.length
		}
	}
}

export { launchComputation, computeUserScores, computeGlobalScores }
