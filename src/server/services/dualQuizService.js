import { getEntriesByIds, getAllEntriesWithScores } from '../repository/entriesRepository.js'

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
 * Picks one element of `options` at random, weighted by `weightFn(option)`.
 * Shared cumulative-weight draw used for both step 1 (weight by the
 * candidate's own score) and the fallback step 1 over unscored entries
 * (weight by global score) - see pickPair()/pickSingleCandidate() below.
 */
function pickWeightedBy(options, weightFn) {
	const wsum = options.map(weightFn).reduce((a, b) => a + b, 0)
	let rnd = Math.random() * wsum
	let i = 0
	while(rnd > weightFn(options[i])) {
		rnd -= weightFn(options[i])
		i++
	}
	return options[i]
}

/**
 * Weight function for step 1 (picking an entry by its own score): the
 * higher the score, the more likely it is to be picked. +1 so a 0 score
 * still keeps a chance of being picked.
 */
function ownScoreWeight(s) {
	return s.score + 1
}

/**
 * Picks a second element of `options` (excluding `fixed`), weighted by score
 * proximity with `fixed` (step 2). Every other entry keeps a (small) chance
 * of being picked via weightFor(), so this never runs out of candidates even
 * when every score is far apart from `fixed`. `options` must not be empty
 * once `fixed` is excluded.
 */
function pickByProximity(options, fixed) {
	const candidates = []
	const w = []
	let wsum = 0
	for(const s of options) {
		if(s.id === fixed.id) continue
		const abs = Math.abs(fixed.score - s.score)
		const _w = weightFor(abs)
		candidates.push(s)
		w.push(_w)
		wsum += _w
	}
	let rnd = Math.random() * wsum
	let i = 0
	while(rnd > w[i]) {
		rnd -= w[i]
		i++
	}
	return candidates[i]
}

/**
 * Picks a pair of entries weighted by score proximity, for a new dual quiz.
 * Mirrors the client-side pickPair() that used to live in DualQuiz.jsx,
 * moved here so the client no longer needs to load the full user score list
 * to pick a pair.
 *
 * `options`: list of {id, label, image, score} (the user's own raw score
 * list). Returns null if options.length < 2 (not enough scored entries for
 * a duel) — up to the caller to map that to an HTTP status.
 */
function pickPair(options) {
	if(!Array.isArray(options) || options.length < 2) return null

	const e1 = pickWeightedBy(options, ownScoreWeight)
	const e2 = pickByProximity(options, e1)
	return [e1, e2]
}

/**
 * Builds the full scored entry list for `user` (mirrors the old
 * User.getUserList()): batches every scored entry's label/image/globalScore
 * in one round-trip. Uses the user's raw scores as-is (no 0-1 stretching):
 * weightFor()'s thresholds (0.25/2) are meant to read directly against the
 * app's actual score scale, not a per-user relative one.
 */
async function getUserScoredList(sqlite, user) {
	const entryIds = Object.keys(user.entries)
	if(!entryIds.length) return []

	const entriesById = await getEntriesByIds(sqlite, entryIds)

	return entryIds.map((entryId) => {
		const entry = entriesById.get(entryId)
		return {
			id: entryId,
			label: entry?.name,
			image: entry?.image,
			score: user.entries[entryId],
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
	const options = await getUserScoredList(sqlite, user)
	const pair = pickPair(options)
	if(!pair) return null

	const [e1, e2] = pair
	return {
		left: {id: e1.id, label: e1.label, image: e1.image, score: e1.score},
		right: {id: e2.id, label: e2.label, image: e2.image, score: e2.score},
	}
}

/**
 * Serializes a scored-list entry (or a fallback entry, see below) into the
 * shape the client expects for a single suggestion.
 */
function serializeCandidate(e) {
	return {id: e.id, label: e.label, image: e.image, score: e.score}
}

/**
 * Builds candidates for the fallback path (no scored entry left once
 * `fixedEntryId`/`excludeIds` are removed): every entry the user has never
 * compared at all, weighted by global_score (same step-1 weighting as
 * pickPair's e1, applied to global_score instead of the user's own score).
 * Never mixes scored and unscored entries in the same draw.
 */
async function getUnscoredCandidates(sqlite, user, excluded) {
	const all = await getAllEntriesWithScores(sqlite)
	return all
		.filter((entry) => !(entry.id in user.entries) && !excluded.has(entry.id))
		.map((entry) => ({id: entry.id, label: entry.name, image: entry.image, score: entry.globalScore ?? 0}))
}

/**
 * Picks a single entry to face `fixedEntryId` (or picked freestanding if
 * `fixedEntryId` is null - the "Randomize both" case reuses pickDualPair
 * instead, this is only for a single-side reroll), excluding `excludeIds`
 * (typically the entry currently on that side, so it doesn't come right
 * back).
 *
 * Falls back to entries the user has never compared at all (weighted by
 * global_score) when no scored candidate is left after exclusion - this is
 * also what makes the picker usable for a user with too few scored entries.
 * When `fixedEntryId` itself has no user score (e.g. it just came from that
 * same fallback), proximity weighting is meaningless, so the candidate is
 * picked by its own score instead (step 1) rather than by proximity.
 *
 * Returns null only if there is truly no candidate anywhere (every entry is
 * either `fixedEntryId` or in `excludeIds`).
 */
async function pickSingleCandidate(sqlite, user, {fixedEntryId, excludeIds = []} = {}) {
	const excluded = new Set(excludeIds)
	if(fixedEntryId != null) excluded.add(fixedEntryId)

	const scoredList = await getUserScoredList(sqlite, user)
	const scoredCandidates = scoredList.filter((s) => !excluded.has(s.id))

	if(scoredCandidates.length) {
		const fixed = fixedEntryId != null ? scoredList.find((s) => s.id === fixedEntryId) : null
		const picked = fixed
			? pickByProximity(scoredCandidates, fixed)
			: pickWeightedBy(scoredCandidates, ownScoreWeight)
		return serializeCandidate(picked)
	}

	const unscoredCandidates = await getUnscoredCandidates(sqlite, user, excluded)
	if(!unscoredCandidates.length) return null
	return serializeCandidate(pickWeightedBy(unscoredCandidates, ownScoreWeight))
}

export { pickPair, weightFor, pickDualPair, pickSingleCandidate }
