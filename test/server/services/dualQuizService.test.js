import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { getEntryByName } from '../../../src/server/data/entriesRepository.js'
import { pickPair, weightFor, pickDualPair } from '../../../src/server/services/dualQuizService.js'

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
	beforeEach(() => { sqlite = db.sqlite })

	test('returns null when the user has fewer than 2 scored entries', async () => {
		const a = await getEntryByName(sqlite, 'A', true)
		const user = {entries: {[a.id]: 0.5}}
		assert.equal(await pickDualPair(sqlite, user), null)
	})

	test('returns null when the user has no scored entries at all', async () => {
		const user = {entries: {}}
		assert.equal(await pickDualPair(sqlite, user), null)
	})

	test('returns {left, right} serialized from the two picked entries', async () => {
		const a = await getEntryByName(sqlite, 'A', true)
		const b = await getEntryByName(sqlite, 'B', true)
		const user = {entries: {[a.id]: 0.2, [b.id]: 0.8}}

		const pair = await pickDualPair(sqlite, user)

		assert.ok(pair.left)
		assert.ok(pair.right)
		assert.notEqual(pair.left.id, pair.right.id)
		for(const side of [pair.left, pair.right]) {
			assert.ok('id' in side && 'label' in side && 'image' in side && 'score' in side)
		}
	})
})
