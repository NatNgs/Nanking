import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Manager } from '../../../src/server/data/db.js'
import { User, ALL_USERS, anyUserReferencesEntry } from '../../../src/server/data/user.js'
import { Entry } from '../../../src/server/data/entries.js'
import ENTRIES from '../../../src/server/data/entries.js'
import { DefaultValueQuiz, DualQuiz } from '../../../src/server/data/quiz.js'

function makeUser() {
	return new User(new Manager({}), 'bobby')
}

describe('User construction', () => {
	test('starts with an empty tags score map', () => {
		const user = makeUser()
		assert.deepEqual(user.tags, {})
	})
})

describe('User.getUserList', () => {
	beforeEach(() => {
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
	})

	test('returns an empty list when the user has no entries', () => {
		const user = makeUser()
		assert.deepEqual(user.getUserList(), [])
	})

	test('falls back to 0.5 when the user has a single entry (no variance to stretch)', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:0'].globalScore = 0.7
		const user = makeUser()
		user.entries['n:0'] = 0.3

		const list = user.getUserList()

		assert.equal(list.length, 1)
		assert.equal(list[0].score, 0.5)
		assert.equal(Number.isFinite(list[0].score), true)
	})

	test('falls back to 0.5 when every entry has the same score (no variance to stretch)', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
		const user = makeUser()
		user.entries['n:0'] = 0.4
		user.entries['n:1'] = 0.4

		const list = user.getUserList()

		for(const entry of list) {
			assert.equal(entry.score, 0.5)
			assert.equal(Number.isFinite(entry.score), true)
		}
	})

	test('stretches distinct scores to the full 0-1 range', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
		ENTRIES.entries['n:2'] = new Entry('n:2', 'C')
		const user = makeUser()
		user.entries['n:0'] = 0
		user.entries['n:1'] = 5
		user.entries['n:2'] = 10

		const list = user.getUserList()

		const byId = Object.fromEntries(list.map((e) => [e.id, e]))
		assert.equal(byId['n:0'].score, 0)
		assert.equal(byId['n:1'].score, 0.5)
		assert.equal(byId['n:2'].score, 1)
	})

	test('every returned score is a finite number, never NaN/undefined/null', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		const user = makeUser()
		user.entries['n:0'] = 0

		const list = user.getUserList()

		for(const entry of list) {
			assert.equal(typeof entry.score, 'number')
			assert.equal(Number.isFinite(entry.score), true)
		}
	})

	test('carries over the entry\'s label, image, and globalScore unchanged', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:0'].globalScore = 0.42
		const user = makeUser()
		user.entries['n:0'] = 0.1

		const [entry] = user.getUserList()

		assert.equal(entry.label, 'A')
		assert.equal(entry.image, 'assets/unknown.svg')
		assert.equal(entry.globalScore, 0.42)
	})
})

describe('User.getUserListPaginated', () => {
	beforeEach(() => {
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
	})

	test('sorts on the raw score (preserved order under stretching, a monotonic transform) then stretches only the page', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
		ENTRIES.entries['n:2'] = new Entry('n:2', 'C')
		const user = makeUser()
		user.entries['n:0'] = 0.9
		user.entries['n:1'] = 0.5
		user.entries['n:2'] = 0.1

		const result = user.getUserListPaginated({sort: 'score', order: 'desc', page: 1, limit: 2})

		// Order preserved: n:0 (0.9) then n:1 (0.5), n:2 (0.1) excluded from this page
		assert.deepEqual(result.items.map((i) => i.id), ['n:0', 'n:1'])
		// Scores returned are STRETCHED (min=0.1, max=0.9, range=0.8), not raw
		assert.equal(result.items[0].score, 1) // (0.9-0.1)/0.8
		assert.equal(result.items[1].score, 0.5) // (0.5-0.1)/0.8
	})

	test('falls back to 0.5 for every item when min===max (no variance to stretch)', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
		const user = makeUser()
		user.entries['n:0'] = 0.4
		user.entries['n:1'] = 0.4

		const result = user.getUserListPaginated({page: 1, limit: 10})

		for(const item of result.items) assert.equal(item.score, 0.5)
	})

	test('total reflects the full scored entries count, not just the page size', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
		ENTRIES.entries['n:2'] = new Entry('n:2', 'C')
		const user = makeUser()
		user.entries['n:0'] = 0.1
		user.entries['n:1'] = 0.5
		user.entries['n:2'] = 0.9

		const result = user.getUserListPaginated({page: 1, limit: 2})

		assert.equal(result.total, 3)
		assert.equal(result.items.length, 2)
		assert.equal(result.hasMore, true)
	})

	test('sort=label sorts by entry name instead of score', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'Zebra')
		ENTRIES.entries['n:1'] = new Entry('n:1', 'Apple')
		const user = makeUser()
		user.entries['n:0'] = 0.1
		user.entries['n:1'] = 0.9

		const result = user.getUserListPaginated({sort: 'label', order: 'asc', page: 1, limit: 10})

		assert.deepEqual(result.items.map((i) => i.label), ['Apple', 'Zebra'])
	})

	test('getUserList() (non-paginated) remains unchanged, still returning the full stretched list', () => {
		ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
		ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
		const user = makeUser()
		user.entries['n:0'] = 0.2
		user.entries['n:1'] = 0.8

		const fullList = user.getUserList()

		assert.equal(fullList.length, 2)
		assert.ok(fullList.every((e) => Number.isFinite(e.score)))
	})
})

describe('User.removeAllReferencesToEntry', () => {
	beforeEach(() => {
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
	})

	test('removes a default quiz referencing the entry', () => {
		const entryA = new Entry('n:0', 'A')
		const user = makeUser()
		user.quiz.push(new DefaultValueQuiz(entryA, 1))

		user.removeAllReferencesToEntry(entryA)

		assert.equal(user.quiz.length, 0)
	})

	test('removes a dual quiz referencing the entry (either side)', () => {
		const entryA = new Entry('n:0', 'A')
		const entryB = new Entry('n:1', 'B')
		const user = makeUser()
		user.quiz.push(new DualQuiz(entryA, entryB, 1))

		user.removeAllReferencesToEntry(entryA)

		assert.equal(user.quiz.length, 0)
	})

	test('leaves quiz referencing other entries untouched', () => {
		const entryA = new Entry('n:0', 'A')
		const entryB = new Entry('n:1', 'B')
		const user = makeUser()
		const untouched = new DefaultValueQuiz(entryB, 1)
		user.quiz.push(new DefaultValueQuiz(entryA, 1))
		user.quiz.push(untouched)

		user.removeAllReferencesToEntry(entryA)

		assert.deepEqual(user.quiz, [untouched])
	})

	test('removes the computed score for the entry', () => {
		const entryA = new Entry('n:0', 'A')
		const user = makeUser()
		user.entries[entryA.id] = 0.7

		user.removeAllReferencesToEntry(entryA)

		assert.equal(user.entries.hasOwnProperty(entryA.id), false)
	})
})

describe('anyUserReferencesEntry', () => {
	beforeEach(() => {
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
		for(const key in ALL_USERS) delete ALL_USERS[key]
	})

	test('returns true when a user still has a vote referencing the entry', () => {
		const entryA = new Entry('n:0', 'A')
		const alice = makeUser()
		alice.quiz.push(new DefaultValueQuiz(entryA, 1))
		ALL_USERS.alice = alice

		assert.equal(anyUserReferencesEntry(entryA), true)
	})

	test('returns false when no user has a vote referencing the entry', () => {
		const entryA = new Entry('n:0', 'A')
		const entryB = new Entry('n:1', 'B')
		const alice = makeUser()
		alice.quiz.push(new DefaultValueQuiz(entryB, 1))
		ALL_USERS.alice = alice

		assert.equal(anyUserReferencesEntry(entryA), false)
	})

	test('returns false when there are no known users at all', () => {
		const entryA = new Entry('n:0', 'A')
		assert.equal(anyUserReferencesEntry(entryA), false)
	})
})
