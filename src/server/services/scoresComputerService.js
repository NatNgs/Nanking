import CONFIG from '../config/config.js'
import { getUser, getAllUsernames } from '../repository/userRepository.js'
import { getAllEntriesWithScores, saveEntry } from '../repository/entriesRepository.js'
import { getUserScores, saveUserScores } from '../repository/userEntryRepository.js'

let computationTimeoutHandler = null

/**
 * Periodic score computation cycle: reloads every username/user it needs
 * straight from SQLite, computes and persists each user's scores (one
 * getUser + one getUserScores per user, no double load), collects every
 * entry's contributing scores along the way, then finalizes global scores in
 * one pass - see computeGlobalScores().
 */
async function launchComputation(sqlite) {
	if(computationTimeoutHandler) {
		clearTimeout(computationTimeoutHandler)
		computationTimeoutHandler = null
	}

	const usernames = await getAllUsernames(sqlite)
	const scoresByEntry = {} // entryId: [user1Score, user2Score, ...]
	for(const username of usernames) {
		const user = await getUser(sqlite, username)
		if(!user) continue

		const previousScores = await getUserScores(sqlite, username)
		const {scores} = computeUserScores(user.quiz, previousScores)
		await saveUserScores(sqlite, username, scores)

		for(const entryId in scores) {
			(scoresByEntry[entryId] ??= []).push(scores[entryId])
		}
	}

	await computeGlobalScores(sqlite, scoresByEntry)

	// Planify next computation
	computationTimeoutHandler = setTimeout(() => launchComputation(sqlite), CONFIG.SCORE_COMPUTE_INTERVAL)
}

/**
 * Pure computation of a user's scores from `quiz` (already loaded, in
 * chronological order) and `previousScores` ({entryId: score}, the last
 * known value for each entry). No SQL, no `User` object: callers own loading
 * `quiz`/`previousScores` and persisting the result. An entry with no more
 * quiz referencing it (e.g. its last vote was just removed) has no entry in
 * `entriesLists`, and is therefore absent from the returned `scores` too,
 * instead of keeping its last computed score around forever as a stale,
 * orphaned value.
 *
 * Returns {scores, totalChange}: `scores` is the new {entryId: score} map,
 * `totalChange` is the sum of absolute changes against `previousScores` (an
 * entry appearing or disappearing counts its full score as a change) - lets
 * callers loop until this settles below a threshold, see quizRoutes.js's
 * "recompute until stable" loop.
 */
function computeUserScores(quiz, previousScores) {
	const currScores = {}
	for(const entryId in previousScores) {
		if(previousScores[entryId] || previousScores[entryId] === 0) { // remove invalid scores (NaN, null, undefined)
			currScores[entryId] = previousScores[entryId]
		}
	}

	const entriesLists = {} // entryId: [quizScore1, quizScore2, ...]
	const entriesById = new Map()
	for(const q of quiz) {
		q.apply(currScores, entriesLists)
		if(q.type === 'direct') entriesById.set(q.entry.id, q.entry)
		else { entriesById.set(q.neg.id, q.neg); entriesById.set(q.pos.id, q.pos) }
	}

	// Append globalScore to every entry
	for(const entryId in entriesLists) {
		entriesLists[entryId].push(entriesById.get(entryId).globalScore)
	}

	const scores = {}
	for(const entryId in entriesLists) {
		const entriesList = entriesLists[entryId]
		scores[entryId] = entriesList.reduce((a, b) => a + b) / entriesList.length
	}

	let totalChange = 0
	const seenEntryIds = new Set([...Object.keys(currScores), ...Object.keys(scores)])
	for(const entryId of seenEntryIds) {
		totalChange += Math.abs((scores[entryId] ?? 0) - (currScores[entryId] ?? 0))
	}

	return {scores, totalChange}
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
 *
 * `scoresByEntry` ({entryId: [score1, score2, ...]}) is collected once by
 * launchComputation() while it recomputes every user - this function only
 * finalizes it (stretch 0-1 + save), it never reloads users itself.
 */
async function computeGlobalScores(sqlite, scoresByEntry) {
	const entries = await getAllEntriesWithScores(sqlite)
	const entriesById = new Map(entries.map((e) => [e.id, e]))

	// Average all users scores
	const allScores = {} // entryId: [user1Score, user2Score, ...]
	for(const entry of entries) {
		allScores[entry.id] = [entry.globalScore, ...(scoresByEntry[entry.id] || [])]
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
