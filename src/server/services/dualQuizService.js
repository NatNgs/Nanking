import { getEntriesByIds } from '../data/entriesRepository.js'

/**
 * Weight of the second duel entry, based on the absolute score gap with the
 * first one already picked (abs). Mirrors the client-side weightFor() that
 * used to live in DualQuiz.jsx:
 * - abs in [0, 0.25]: linearly interpolated from 10 (abs=0) to 1 (abs=0.25)
 * - abs in [0.25, 2]: linearly interpolated from 0.1 (abs=0.25) to 0.001 (abs=2)
 * - abs > 2: capped at 0.001
 * Exported separately so its values can be tested directly at the boundaries,
 * independent of pickPair's random draw.
 */
function weightFor(abs) {
	if(abs <= 0.25) return 10 - 9 * (abs / 0.25)
	if(abs >= 2) return 0.001
	return 0.1 - 0.099 * ((abs - 0.25) / 1.75)
}

/**
 * Picks a pair of entries weighted by score proximity, for a new dual quiz.
 * Mirrors the client-side pickPair() that used to live in DualQuiz.jsx,
 * moved here so the client no longer needs to load the full user score list
 * to pick a pair.
 *
 * `options`: list of {id, label, image, score} (the user's own stretched
 * score list). Returns null if options.length < 2 (not enough scored
 * entries for a duel) — up to the caller to map that to an HTTP status.
 */
function pickPair(options) {
	if(!Array.isArray(options) || options.length < 2) return null

	// Pick the first element at random. Assign a weight such as the more score it has, the more chance it has to be picked.
	const f1 = (s) => (s.score + 1)
	let wsum = options.map(f1).reduce((a, b) => a + b, 0)
	let rnd = Math.random() * wsum
	let i1 = 0
	while(rnd > f1(options[i1])) {
		rnd -= f1(options[i1])
		i1++
	}
	const e1 = options[i1]

	// Pick a second element at random. Assign a weight such as the more scores
	// are similar with i1, the more chance it has to be picked. Every other
	// entry keeps a (small) chance of being picked, so this never runs out of
	// candidates even when every score is far apart from e1.
	const candidates = []
	const w = []
	wsum = 0
	for(const s of options) {
		if(s.id === e1.id) continue
		const abs = Math.abs(e1.score - s.score)
		candidates.push(s)
		const _w = weightFor(abs)
		w.push(_w)
		wsum += _w
	}
	rnd = Math.random() * wsum
	let i2 = 0
	while(rnd > w[i2]) {
		rnd -= w[i2]
		i2++
	}
	const e2 = candidates[i2]

	return [e1, e2]
}

/**
 * Builds the full stretched score list for `user` (mirrors the old
 * User.getUserList()): batches every scored entry's label/image/globalScore
 * in one round-trip, then stretches user.entries' raw scores to 0-1.
 */
async function getUserStretchedList(sqlite, user) {
	const entryIds = Object.keys(user.entries)
	if(!entryIds.length) return []

	const entriesById = await getEntriesByIds(sqlite, entryIds)
	const values = Object.values(user.entries)
	const minUserScore = Math.min(...values)
	const maxUserScore = Math.max(...values)
	const range = maxUserScore - minUserScore

	return entryIds.map((entryId) => {
		const entry = entriesById.get(entryId)
		return {
			id: entryId,
			label: entry?.name,
			image: entry?.image,
			score: range === 0 ? 0.5 : (user.entries[entryId] - minUserScore) / range,
			globalScore: entry?.globalScore,
		}
	})
}

/**
 * Builds the pair for GET /api/quiz/dual: picks via pickPair() over the
 * user's full (un-paginated, never serialized as-is) score list, then
 * serializes only the two chosen entries in the shape the client expects.
 * Returns null if the user doesn't have enough scored entries (<2).
 */
async function pickDualPair(sqlite, user) {
	const options = await getUserStretchedList(sqlite, user)
	const pair = pickPair(options)
	if(!pair) return null

	const [e1, e2] = pair
	return {
		left: {id: e1.id, label: e1.label, image: e1.image, score: e1.score},
		right: {id: e2.id, label: e2.label, image: e2.image, score: e2.score},
	}
}

export { pickPair, weightFor, pickDualPair }
