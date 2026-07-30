import { getEntriesByIds, getAllEntriesWithScores } from '../repository/entriesRepository.js'
import { getUserDualStats } from '../repository/userRepository.js'

// "Extreme" result profile boosts for pickSingleCandidate()/pickPair()'s
// dual-history weighting - see resultProfileWeight().
const EXTREME_RESULT_BOOST = 3
const PARTIAL_RESULT_BOOST = 2

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
 * Dual-history weight factor from a {W, L, E} result count (wins/losses/
 * ties), favoring entries with a one-sided history: never having lost
 * pushes an entry back into rotation, and so does never having won or
 * having only ties - all three are "extreme" in the sense that no dual ever
 * contradicted the others. A genuine mix of wins and losses gets no boost.
 * No history at all (candidate absent from resultCounts) is the most
 * extreme case of all - nothing to contradict a boost.
 */
function resultProfileWeight(counts) {
	const {W = 0, L = 0, E = 0} = counts ?? {}
	if((L === 0 && W === 0) || (L === 0 && E === 0) || (W === 0 && E === 0)) return EXTREME_RESULT_BOOST
	if((L === 0 && W > 0 && E > 0) || (W === 0 && L > 0 && E > 0)) return PARTIAL_RESULT_BOOST
	return 1
}

/** Dual-history weight factor from how many duals an entry already has: fewer duals, higher weight. */
function dualCountWeight(nbDuals) {
	return 1 / (1 + (nbDuals ?? 0))
}

/**
 * Shortest directed path length from `from` to `to` in `outgoing` (a
 * Map<id, Set<id>>), capped at `maxDepth` levels. Returns null if no path is
 * found within that depth (or if `from`/`to` isn't in the graph at all).
 */
function shortestDirectedDistance(outgoing, from, to, maxDepth) {
	if(from === to) return 0
	let frontier = new Set([from])
	const visited = new Set(frontier)
	for(let depth = 1; depth <= maxDepth; depth++) {
		const next = new Set()
		for(const id of frontier) {
			for(const neighbor of outgoing.get(id) ?? []) {
				if(neighbor === to) return depth
				if(!visited.has(neighbor)) {
					visited.add(neighbor)
					next.add(neighbor)
				}
			}
		}
		if(!next.size) break
		frontier = next
	}
	return null
}

/**
 * Weight factor penalizing a candidate for being close to `refId` in the
 * directed graph of already-done duals (see getUserDualStats()): the
 * shorter the path in EITHER direction (ref transitively beat candidate, or
 * candidate transitively beat ref), the stronger the penalty. Two decisive
 * duals converging on a common opponent never produce a path either way, so
 * they are correctly left unpenalized - a property of the directed graph,
 * not special-cased here.
 *
 * `candidateCount` is the size of the candidate pool for this draw (the
 * `N` the penalty is expressed relative to). Returns 1 (no penalty) when
 * `refId` is null, absent from the graph, or no path is found within
 * floor(sqrt(candidateCount)) levels either way.
 */
function distancePenalty(candidateId, refId, outgoing, candidateCount) {
	if(refId == null || candidateId === refId) return 1
	const maxDepth = Math.floor(Math.sqrt(candidateCount))
	if(maxDepth < 1) return 1

	const forward = shortestDirectedDistance(outgoing, refId, candidateId, maxDepth)
	const backward = shortestDirectedDistance(outgoing, candidateId, refId, maxDepth)
	const distances = [forward, backward].filter((d) => d != null)
	if(!distances.length) return 1

	const d = Math.min(...distances)
	return (d + 1) / candidateCount
}

/**
 * Combines a candidate's base weight (score-based, either step 1's own
 * score or step 2's proximity to a fixed entry) with the dual-history
 * factors: fewer existing duals and a one-sided result profile both boost
 * the weight, being close to `refId` in the comparison graph penalizes it.
 * `dualStats` (see getUserDualStats()) is optional - when absent, every
 * history factor is neutral (1), preserving the original score-only
 * behavior for callers that don't have it (e.g. existing tests).
 */
function combinedWeight(candidate, baseWeight, {refId, dualStats, candidateCount}) {
	if(!dualStats) return baseWeight
	const historyFactor = dualCountWeight(dualStats.dualCount.get(candidate.id))
		* resultProfileWeight(dualStats.resultCounts.get(candidate.id))
		* distancePenalty(candidate.id, refId, dualStats.outgoing, candidateCount)
	return baseWeight * historyFactor
}

/**
 * Picks a second element of `options` (excluding `fixed`), weighted by score
 * proximity with `fixed` (step 2), combined with dual-history factors (see
 * combinedWeight()) when `dualStats` is given - `fixed` itself is used as
 * the history graph's reference point. Every other entry keeps a (small)
 * chance of being picked via weightFor(), so this never runs out of
 * candidates even when every score is far apart from `fixed`. `options`
 * must not be empty once `fixed` is excluded.
 */
function pickByProximity(options, fixed, dualStats) {
	const candidates = options.filter((s) => s.id !== fixed.id)
	const weightFn = (s) => combinedWeight(
		s, weightFor(Math.abs(fixed.score - s.score)), {refId: fixed.id, dualStats, candidateCount: options.length}
	)
	return pickWeightedBy(candidates, weightFn)
}

/**
 * Picks a pair of entries weighted by score proximity, for a new dual quiz.
 * Mirrors the client-side pickPair() that used to live in DualQuiz.jsx,
 * moved here so the client no longer needs to load the full user score list
 * to pick a pair.
 *
 * `options`: list of {id, label, image, score} (the user's own raw score
 * list). `dualStats` (optional, see getUserDualStats()) folds the dual
 * picker's history-based factors into both steps' weighting - step 1 (which
 * entry to pick first) has no reference point yet, so only the "few duals"/
 * "one-sided profile" factors apply there, not the distance penalty (step 2
 * uses e1 as the reference point for that). Returns null if
 * options.length < 2 (not enough scored entries for a duel) — up to the
 * caller to map that to an HTTP status.
 */
function pickPair(options, dualStats) {
	if(!Array.isArray(options) || options.length < 2) return null

	const step1WeightFn = (s) => combinedWeight(
		s, ownScoreWeight(s), {refId: null, dualStats, candidateCount: options.length}
	)
	const e1 = pickWeightedBy(options, step1WeightFn)
	const e2 = pickByProximity(options, e1, dualStats)
	return [e1, e2]
}

/**
 * Builds the full scored entry list for `user` (mirrors the old
 * User.getUserList()): batches every scored entry's label/image/globalScore
 * in one round-trip. Uses the user's raw scores as-is (no 0-1 stretching):
 * weightFor()'s thresholds (0.25/2) are meant to read directly against the
 * app's actual score scale, not a per-user relative one.
 */
async function getUserScoredList(sqlite, topicId, user) {
	const entryIds = Object.keys(user.entries)
	if(!entryIds.length) return []

	const entriesById = await getEntriesByIds(sqlite, topicId, entryIds)

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
async function pickDualPair(sqlite, topicId, user) {
	const [options, dualStats] = await Promise.all([
		getUserScoredList(sqlite, topicId, user), getUserDualStats(sqlite, topicId, user.username),
	])
	const pair = pickPair(options, dualStats)
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
async function getUnscoredCandidates(sqlite, topicId, user, excluded) {
	const all = await getAllEntriesWithScores(sqlite, topicId)
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
 * picked by its own score instead (step 1) rather than by proximity. Either
 * way, dual-history factors (see combinedWeight()) fold into the draw,
 * using `fixedEntryId` as the comparison graph's reference point when given.
 *
 * Returns null only if there is truly no candidate anywhere (every entry is
 * either `fixedEntryId` or in `excludeIds`).
 */
async function pickSingleCandidate(sqlite, topicId, user, {fixedEntryId, excludeIds = []} = {}) {
	const excluded = new Set(excludeIds)
	if(fixedEntryId != null) excluded.add(fixedEntryId)

	const [scoredList, dualStats] = await Promise.all([
		getUserScoredList(sqlite, topicId, user), getUserDualStats(sqlite, topicId, user.username),
	])
	const scoredCandidates = scoredList.filter((s) => !excluded.has(s.id))

	if(scoredCandidates.length) {
		const fixed = fixedEntryId != null ? scoredList.find((s) => s.id === fixedEntryId) : null
		const picked = fixed
			? pickByProximity(scoredCandidates, fixed, dualStats)
			: pickWeightedBy(scoredCandidates, (s) => combinedWeight(
				s, ownScoreWeight(s), {refId: null, dualStats, candidateCount: scoredCandidates.length}
			))
		return serializeCandidate(picked)
	}

	const unscoredCandidates = await getUnscoredCandidates(sqlite, topicId, user, excluded)
	if(!unscoredCandidates.length) return null
	const weightFn = (s) => combinedWeight(
		s, ownScoreWeight(s), {refId: fixedEntryId, dualStats, candidateCount: unscoredCandidates.length}
	)
	return serializeCandidate(pickWeightedBy(unscoredCandidates, weightFn))
}

export {
	pickPair, weightFor, pickDualPair, pickSingleCandidate,
	resultProfileWeight, dualCountWeight, distancePenalty, pickByProximity,
}
