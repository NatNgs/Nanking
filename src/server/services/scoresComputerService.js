import CONFIG from '../config/config.js'
import { getUser, getAllUsernames } from '../data/userRepository.js'
import { getAllEntriesWithScores, saveEntry } from '../data/entriesRepository.js'

let computationTimeoutHandler = null

/**
 * Periodic score computation cycle: reloads every username/user/entry it
 * needs straight from SQLite, computes, persists the result, then lets every
 * local variable fall out of scope for GC - no state kept between two cycles.
 */
async function launchComputation(sqlite) {
	if(computationTimeoutHandler) {
		clearTimeout(computationTimeoutHandler)
		computationTimeoutHandler = null
	}

	// 1: For every user, run computeUserScores
	const usernames = await getAllUsernames(sqlite)
	for(const username of usernames) {
		const user = await getUser(sqlite, username)
		if(user) await computeUserScores(sqlite, user)
	}

	// 2: Run computeGlobalScores
	await computeGlobalScores(sqlite)

	// Planify next computation
	computationTimeoutHandler = setTimeout(() => launchComputation(sqlite), CONFIG.SCORE_COMPUTE_INTERVAL)
}

/**
 * Recomputes user.entries in place, from `user.quiz` (already loaded) and
 * each referenced entry's current globalScore. Deliberately not persisted:
 * per-user scores are always derived on demand from direct_quiz/dual_quiz
 * (the votes themselves, already the source of truth), never cached in a
 * dedicated table - see README's design notes on this rework.
 */
async function computeUserScores(sqlite, user) {
	const currScores = {}
	for(const entryId in user.entries) {
		if(user.entries[entryId] || user.entries[entryId] === 0) { // remove invalid scores (NaN, null, undefined)
			currScores[entryId] = user.entries[entryId]
		}
	}

	const entriesLists = {} // entryId: [quizScore1, quizScore2, ...]
	const entriesById = new Map()
	for(const q of user.quiz) {
		q.apply(currScores, entriesLists)
		if(q.type === 'direct') entriesById.set(q.entry.id, q.entry)
		else { entriesById.set(q.neg.id, q.neg); entriesById.set(q.pos.id, q.pos) }
	}

	// Append globalScore to every entry
	for(const entryId in entriesLists) {
		entriesLists[entryId].push(entriesById.get(entryId).globalScore)
	}

	// Rebuild user.entries from scratch (rather than only updating/adding into
	// the existing object): an entry with no more quiz referencing it (e.g.
	// its last vote was just removed) has no entry in entriesLists, and must
	// disappear from user.entries too, instead of keeping its last computed
	// score around forever as a stale, orphaned value.
	const newEntries = {}
	for(const entryId in entriesLists) {
		const entriesList = entriesLists[entryId]
		newEntries[entryId] = entriesList.reduce((a, b) => a + b) / entriesList.length
	}
	user.entries = newEntries
}

/**
 * Recomputes every entry's global_score (average of every user's own score on
 * it, min-max stretched to 0-1), persisting the result directly to
 * entries.global_score. An entry with no contributing user score at all keeps
 * its previous global_score untouched (no reset, no deletion): entries are
 * never removed by this cycle, only by explicit user action (deleteEntry in
 * entryService.js) - see this rework's design notes on why the old "delete an
 * unscored entry" behavior was dropped (a newly created entry could get
 * deleted before its first vote ever landed, a race that used to be masked by
 * the old in-memory model's deferred persistence).
 */
async function computeGlobalScores(sqlite) {
	const entries = await getAllEntriesWithScores(sqlite)
	const entriesById = new Map(entries.map((e) => [e.id, e]))

	// Average all users scores
	const allScores = {} // entryId: [user1Score, user2Score, ...]
	for(const entry of entries) {
		allScores[entry.id] = [entry.globalScore]
	}

	const usernames = await getAllUsernames(sqlite)
	for(const username of usernames) {
		const user = await getUser(sqlite, username)
		if(!user) continue
		await computeUserScores(sqlite, user)
		for(const entryId in user.entries) {
			if(!allScores[entryId]) allScores[entryId] = []
			allScores[entryId].push(user.entries[entryId])
		}
	}

	// Average allScores and set entries' new globalScores. An entry with no
	// real user score (only its own initial globalScore counted) is left out
	// of the stretch entirely - its global_score stays whatever it was.
	const averages = {}
	for(const entryId in allScores) {
		if(allScores[entryId].length <= 1) continue
		averages[entryId] = allScores[entryId].reduce((a, b) => a + b) / allScores[entryId].length
	}

	// Stretch scores from 0 (worst) to 1 (best). With no variance to stretch
	// (a single entry, or every entry tied), fall back to the neutral 0.5
	// rather than dividing by zero.
	const min = Math.min(...Object.values(averages))
	const max = Math.max(...Object.values(averages))
	for(const entryId in averages) {
		const entry = entriesById.get(entryId)
		entry.globalScore = max === min ? 0.5 : (averages[entryId] - min) / (max - min)
		await saveEntry(sqlite, entry)
	}
}

export { launchComputation, computeUserScores, computeGlobalScores }
