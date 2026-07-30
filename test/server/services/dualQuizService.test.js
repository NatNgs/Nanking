import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { getEntryByName, saveEntry } from '../../../src/server/repository/entriesRepository.js'
import { getUser, saveUser, getUserDualStats } from '../../../src/server/repository/userRepository.js'
import { addAccount } from '../../../src/server/repository/accountsRepository.js'
import { DualQuiz } from '../../../src/server/model/quizModel.js'
import {
	pickPair, weightFor, pickDualPair, pickSingleCandidate,
	resultProfileWeight, dualCountWeight, distancePenalty, pickByProximity,
} from '../../../src/server/services/dualQuizService.js'

const TOPIC = 'anime'

describe('weightFor', () => {
	test('at abs=0, weight is 10', () => {
		assert.equal(weightFor(0), 10)
	})

	test('at abs=0.25, weight is 1', () => {
		assert.equal(weightFor(0.25), 1)
	})

	test('at abs=2, weight is 0.001', () => {
		assert.equal(weightFor(2), 0.001)
	})

	test('above abs=2, weight is capped at 0.001', () => {
		assert.equal(weightFor(5), 0.001)
		assert.equal(weightFor(100), 0.001)
	})

	test('interpolates linearly within [0, 0.25]', () => {
		// Midpoint (abs=0.125) should be halfway between 10 and 1
		assert.equal(weightFor(0.125), 10 - 9 * 0.5)
	})

	test('interpolates linearly within [0.25, 2]', () => {
		// Midpoint (abs=1.125) should be halfway between 0.1 and 0.001
		const expected = 0.1 - 0.099 * 0.5
		assert.ok(Math.abs(weightFor(1.125) - expected) < 1e-9)
	})
})

describe('pickPair', () => {
	test('returns null when fewer than 2 options are given', () => {
		assert.equal(pickPair([]), null)
		assert.equal(pickPair([{id: 'a', score: 0.5}]), null)
	})

	test('returns two distinct options from the input list', () => {
		const options = [
			{id: 'a', score: 0.1},
			{id: 'b', score: 0.5},
			{id: 'c', score: 0.9},
		]
		const [e1, e2] = pickPair(options)
		assert.notEqual(e1.id, e2.id)
		assert.ok(options.includes(e1))
		assert.ok(options.includes(e2))
	})

	test('with a deterministic Math.random, picks based on cumulative weights', (t) => {
		t.mock.method(Math, 'random', () => 0) // always picks the first candidate in cumulative order
		const options = [
			{id: 'a', score: 0},
			{id: 'b', score: 1},
		]
		const [e1, e2] = pickPair(options)
		assert.equal(e1.id, 'a') // rnd=0 * wsum -> first bucket
		assert.equal(e2.id, 'b') // only remaining candidate
	})
})

describe('pickDualPair', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	test('returns null when the user has fewer than 2 scored entries', async () => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const user = {username: 'u', entries: {[a.id]: 0.5}}
		assert.equal(await pickDualPair(sqlite, TOPIC, user), null)
	})

	test('returns null when the user has no scored entries at all', async () => {
		const user = {username: 'u', entries: {}}
		assert.equal(await pickDualPair(sqlite, TOPIC, user), null)
	})

	test('returns {left, right} serialized from the two picked entries', async () => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const b = await getEntryByName(sqlite, TOPIC, 'B', true)
		const user = {username: 'u', entries: {[a.id]: 0.2, [b.id]: 0.8}}

		const pair = await pickDualPair(sqlite, TOPIC, user)

		assert.ok(pair.left)
		assert.ok(pair.right)
		assert.notEqual(pair.left.id, pair.right.id)
		for(const side of [pair.left, pair.right]) {
			assert.ok('id' in side && 'label' in side && 'image' in side && 'score' in side)
		}
	})
})

describe('pickSingleCandidate', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	test('excludes fixedEntryId and excludeIds from the draw', async (t) => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const b = await getEntryByName(sqlite, TOPIC, 'B', true)
		const c = await getEntryByName(sqlite, TOPIC, 'C', true)
		const user = {username: 'u', entries: {[a.id]: 0.2, [b.id]: 0.5, [c.id]: 0.8}}

		t.mock.method(Math, 'random', () => 0)
		const candidate = await pickSingleCandidate(sqlite, TOPIC, user, {fixedEntryId: a.id, excludeIds: [b.id]})
		assert.equal(candidate.id, c.id)
	})

	test('picks by proximity to fixedEntryId when scored candidates remain', async (t) => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const b = await getEntryByName(sqlite, TOPIC, 'B', true)
		const c = await getEntryByName(sqlite, TOPIC, 'C', true)
		// b is much closer to a's score than c is
		const user = {username: 'u', entries: {[a.id]: 0.5, [b.id]: 0.55, [c.id]: 5}}

		t.mock.method(Math, 'random', () => 0) // picks the first candidate in cumulative (proximity) order
		const candidate = await pickSingleCandidate(sqlite, TOPIC, user, {fixedEntryId: a.id})
		assert.equal(candidate.id, b.id)
	})

	test('picks by own score (step 1) when no fixedEntryId is given', async (t) => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const b = await getEntryByName(sqlite, TOPIC, 'B', true)
		const user = {username: 'u', entries: {[a.id]: 0, [b.id]: 10}}

		t.mock.method(Math, 'random', () => 0) // rnd=0 -> first bucket in cumulative order
		const candidate = await pickSingleCandidate(sqlite, TOPIC, user, {})
		assert.equal(candidate.id, a.id)
	})

	test('falls back to entries never compared by the user, weighted by global_score, '
		+ 'when no scored candidate is left', async () => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const unseen = await getEntryByName(sqlite, TOPIC, 'Unseen', true)
		unseen.globalScore = 0.9
		await saveEntry(sqlite, TOPIC, unseen)
		const user = {username: 'u', entries: {[a.id]: 0.5}}

		// Only scored entry (a) is both fixed and excluded -> falls back to unseen
		const candidate = await pickSingleCandidate(sqlite, TOPIC, user, {fixedEntryId: a.id, excludeIds: [a.id]})
		assert.equal(candidate.id, unseen.id)
	})

	test('never mixes scored and unscored entries in the fallback draw', async (t) => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const b = await getEntryByName(sqlite, TOPIC, 'B', true)
		await getEntryByName(sqlite, TOPIC, 'Unseen', true)
		const user = {username: 'u', entries: {[a.id]: 0.2, [b.id]: 0.8}}

		// Scored candidates remain (b, once a is fixed) -> must NOT fall back to Unseen
		t.mock.method(Math, 'random', () => 0)
		const candidate = await pickSingleCandidate(sqlite, TOPIC, user, {fixedEntryId: a.id})
		assert.equal(candidate.id, b.id)
	})

	test('returns null when there is truly no candidate anywhere', async () => {
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const user = {username: 'u', entries: {[a.id]: 0.5}}

		const candidate = await pickSingleCandidate(sqlite, TOPIC, user, {fixedEntryId: a.id, excludeIds: [a.id]})
		assert.equal(candidate, null)
	})
})

describe('resultProfileWeight', () => {
	test('boosts an entry with no dual history at all', () => {
		assert.equal(resultProfileWeight(undefined), 3)
		assert.equal(resultProfileWeight({W: 0, L: 0, E: 0}), 3)
	})

	test('boosts an entry with only wins', () => {
		assert.equal(resultProfileWeight({W: 3, L: 0, E: 0}), 3)
	})

	test('boosts an entry with only losses', () => {
		assert.equal(resultProfileWeight({W: 0, L: 2, E: 0}), 3)
	})

	test('boosts an entry with only ties', () => {
		assert.equal(resultProfileWeight({W: 0, L: 0, E: 4}), 3)
	})

	test('partially boosts wins mixed with ties but no loss', () => {
		assert.equal(resultProfileWeight({W: 2, L: 0, E: 1}), 2)
	})

	test('partially boosts losses mixed with ties but no win', () => {
		assert.equal(resultProfileWeight({W: 0, L: 2, E: 1}), 2)
	})

	test('gives no boost to a genuine mix of wins and losses', () => {
		assert.equal(resultProfileWeight({W: 1, L: 1, E: 0}), 1)
		assert.equal(resultProfileWeight({W: 2, L: 3, E: 5}), 1)
	})
})

describe('dualCountWeight', () => {
	test('is 1 for an entry with no duals', () => {
		assert.equal(dualCountWeight(0), 1)
		assert.equal(dualCountWeight(undefined), 1)
	})

	test('decreases as the dual count grows', () => {
		assert.equal(dualCountWeight(1), 0.5)
		assert.equal(dualCountWeight(3), 0.25)
	})
})

describe('distancePenalty', () => {
	function chain(...ids) {
		const outgoing = new Map()
		for(let i = 0; i < ids.length - 1; i++) outgoing.set(ids[i], new Set([ids[i + 1]]))
		return outgoing
	}

	test('is 1 (no penalty) when refId is null', () => {
		assert.equal(distancePenalty('a', null, new Map(), 10), 1)
	})

	test('is 1 (no penalty) when candidateId equals refId', () => {
		assert.equal(distancePenalty('a', 'a', new Map(), 10), 1)
	})

	test('penalizes a directly compared pair (distance 1) by (1+1)/N', () => {
		const outgoing = chain('a', 'b') // a beat b
		assert.equal(distancePenalty('b', 'a', outgoing, 10), 2 / 10)
		// symmetric: from b's perspective too (searched in both directions)
		assert.equal(distancePenalty('a', 'b', outgoing, 10), 2 / 10)
	})

	test('penalizes a transitively compared pair (distance 2) by (2+1)/N', () => {
		const outgoing = chain('a', 'b', 'c') // a beat b, b beat c
		assert.equal(distancePenalty('c', 'a', outgoing, 10), 3 / 10)
	})

	test('two decisive votes converging on a common opponent give no path: no penalty', () => {
		const outgoing = new Map([['b', new Set(['a', 'c'])]]) // b beat a, b beat c
		assert.equal(distancePenalty('a', 'c', outgoing, 10), 1)
		assert.equal(distancePenalty('c', 'a', outgoing, 10), 1)
	})

	test('a tie (bidirectional edge) is found as a distance-1 path either way', () => {
		const outgoing = new Map([['a', new Set(['b'])], ['b', new Set(['a'])]])
		assert.equal(distancePenalty('b', 'a', outgoing, 10), 2 / 10)
		assert.equal(distancePenalty('a', 'b', outgoing, 10), 2 / 10)
	})

	test('no penalty beyond floor(sqrt(candidateCount)) levels of depth', () => {
		// candidateCount=9 -> maxDepth=3. Chain a->b->c->d->e: distance(a,e)=4, out of range.
		const outgoing = chain('a', 'b', 'c', 'd', 'e')
		assert.equal(distancePenalty('e', 'a', outgoing, 9), 1)
		// but distance(a,d)=3 is still within range
		assert.equal(distancePenalty('d', 'a', outgoing, 9), 4 / 9)
	})
})

describe('history-aware weighting integration', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	async function pushDual(username, neg, pos, value, ts) {
		const user = await getUser(sqlite, TOPIC, username)
		const quiz = new DualQuiz(neg, pos, value)
		quiz.ts = ts
		user.quiz.push(quiz)
		await saveUser(sqlite, TOPIC, user)
	}

	test('pickPair strongly avoids re-suggesting an already-compared pair over a fresh one', async () => {
		await addAccount(sqlite, 'bobby', 'hashedpwd')
		const a = await getEntryByName(sqlite, TOPIC, 'A', true)
		const b = await getEntryByName(sqlite, TOPIC, 'B', true)
		const c = await getEntryByName(sqlite, TOPIC, 'C', true)
		await pushDual('bobby', a, b, 1, 1) // a-b already compared
		const dualStats = await getUserDualStats(sqlite, TOPIC, 'bobby')

		// Fix e1 = a directly (bypassing step 1's own draw, already covered by
		// other tests) to isolate step 2's history-aware behavior: b and c are
		// equally close to a's score (both weightFor(0)=10), so absent history
		// weighting their step-2 buckets would be identical (50/50). With
		// history weighting: b (won its only dual, against a) gets
		// resultProfileWeight=EXTREME_RESULT_BOOST(3) same as c (no history at
		// all), but b's single dual halves it via dualCountWeight(1)=0.5 - and
		// on top of that, b is at distance 1 from a (candidateCount=3 ->
		// distancePenalty=2/3) while c has no path to a (factor 1). Net:
		// weight(b) = 10*3*0.5*(2/3) = 10, weight(c) = 10*3*1*1 = 30 - b's
		// bucket shrinks to 10/40 = 0.25 of the total.
		const options = [{id: a.id, score: 0.5}, {id: b.id, score: 0.5}, {id: c.id, score: 0.5}]
		const fixed = {id: a.id, score: 0.5}
		const e2AtRnd = (rnd) => {
			const restore = Math.random
			Math.random = () => rnd
			try {
				return pickByProximity(options, fixed, dualStats)
			} finally {
				Math.random = restore
			}
		}
		assert.equal(e2AtRnd(0.1).id, b.id) // well within b's shrunk bucket [0, 0.25)
		assert.equal(e2AtRnd(0.3).id, c.id) // just past b's shrunk bucket
	})

	test('pickSingleCandidate favors an entry with an extreme result profile over a mixed one', async (t) => {
		await addAccount(sqlite, 'bobby', 'hashedpwd')
		const fixed = await getEntryByName(sqlite, TOPIC, 'Fixed', true)
		const extreme = await getEntryByName(sqlite, TOPIC, 'Extreme', true) // only wins, unrelated to fixed
		const mixed = await getEntryByName(sqlite, TOPIC, 'Mixed', true) // wins and losses, unrelated to fixed
		const other = await getEntryByName(sqlite, TOPIC, 'Other', true)
		await pushDual('bobby', other, extreme, 1, 1) // extreme won
		await pushDual('bobby', other, mixed, 1, 2) // mixed won once
		await pushDual('bobby', mixed, other, 1, 3) // mixed lost once (against a fresh other-side vote)

		const user = {
			username: 'bobby',
			entries: {[fixed.id]: 0.5, [extreme.id]: 0.5, [mixed.id]: 0.5, [other.id]: 0.5},
		}
		t.mock.method(Math, 'random', () => 0)
		const candidate = await pickSingleCandidate(sqlite, TOPIC, user, {fixedEntryId: fixed.id})
		assert.equal(candidate.id, extreme.id)
	})
})
