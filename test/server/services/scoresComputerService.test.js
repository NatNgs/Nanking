import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Manager } from '../../../src/server/data/db.js'
import { User, ALL_USERS } from '../../../src/server/data/user.js'
import { EntriesManager, Entry } from '../../../src/server/data/entries.js'
import ENTRIES from '../../../src/server/data/entries.js'
import { DefaultValueQuiz, DualQuiz } from '../../../src/server/data/quiz.js'
import { computeUserScores, computeGlobalScores } from '../../../src/server/services/scoresComputerService.js'

/**
 * Builds a bare User instance (no db-backed persistence needed for these
 * tests) with the given quiz list already attached.
 */
function makeUser(username, quiz) {
	const user = new User(new Manager({}), username)
	user.quiz = quiz
	return user
}

function assertFinite(value, message) {
	assert.equal(typeof value, 'number', message)
	assert.equal(Number.isFinite(value), true, message)
}

describe('scoresComputerService', () => {
	beforeEach(() => {
		// Reset the shared singletons before every test, mirroring the pattern
		// used for db.js/accounts.js singletons elsewhere in this test suite.
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
		for(const key in ALL_USERS) delete ALL_USERS[key]
	})

	describe('computeUserScores', () => {
		test('averages a single default vote with the entry\'s global score', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			ENTRIES.entries[0].globalScore = 0.5
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries[0], 1)])

			computeUserScores(user)

			assertFinite(user.entries[0])
			assert.equal(user.entries[0], (1 + 0.5) / 2)
		})

		test('never produces NaN/undefined/null even with a single entry', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries[0], 0)])

			computeUserScores(user)

			assertFinite(user.entries[0])
		})

		test('averages a dual vote against both entries\' global scores', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			ENTRIES.entries[1] = new Entry(1, 'B')
			const user = makeUser('bobby', [new DualQuiz(ENTRIES.entries[0], ENTRIES.entries[1], 1)])

			computeUserScores(user)

			assertFinite(user.entries[0])
			assertFinite(user.entries[1])
		})

		test('re-running with an already-computed score keeps averaging with the global score, no NaN', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries[0], 0)])

			computeUserScores(user)
			computeUserScores(user)
			computeUserScores(user)

			assertFinite(user.entries[0])
		})
	})

	describe('computeGlobalScores', () => {
		test('falls back to 0.5 when there is a single entry (no variance to stretch)', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			const user = makeUser('bobby', [])
			user.entries[0] = 0.3
			ALL_USERS.bobby = user

			computeGlobalScores()

			assert.equal(ENTRIES.entries[0].globalScore, 0.5)
		})

		test('falls back to 0.5 when every entry\'s score is tied', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			ENTRIES.entries[1] = new Entry(1, 'B')
			const user = makeUser('bobby', [])
			user.entries[0] = 0.4
			user.entries[1] = 0.4
			ALL_USERS.bobby = user

			computeGlobalScores()

			assert.equal(ENTRIES.entries[0].globalScore, 0.5)
			assert.equal(ENTRIES.entries[1].globalScore, 0.5)
		})

		test('stretches distinct scores to the full 0-1 range', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			ENTRIES.entries[1] = new Entry(1, 'B')
			const user = makeUser('bobby', [])
			user.entries[0] = 0
			user.entries[1] = 1
			ALL_USERS.bobby = user

			computeGlobalScores()

			assertFinite(ENTRIES.entries[0].globalScore)
			assertFinite(ENTRIES.entries[1].globalScore)
			assert.equal(ENTRIES.entries[0].globalScore, 0)
			assert.equal(ENTRIES.entries[1].globalScore, 1)
		})

		test('never leaves a NaN globalScore after repeated cycles, even starting from a single entry', () => {
			// Reproduces the real-world sequence: an entry is created and voted
			// on alone first (triggering the single-entry fallback), then a
			// second entry is added and voted on in a later cycle.
			ENTRIES.entries[0] = new Entry(0, 'A')
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries[0], 0)])
			ALL_USERS.bobby = user

			computeUserScores(user)
			computeGlobalScores()
			assertFinite(ENTRIES.entries[0].globalScore)

			ENTRIES.entries[1] = new Entry(1, 'B')
			user.quiz.push(new DefaultValueQuiz(ENTRIES.entries[1], 1))

			for(let i = 0; i < 3; i++) {
				computeUserScores(user)
				computeGlobalScores()
			}

			assertFinite(ENTRIES.entries[0].globalScore)
			assertFinite(ENTRIES.entries[1].globalScore)
			assertFinite(user.entries[0])
			assertFinite(user.entries[1])
		})

		test('removes an entry that only the initial global score accounts for (no real user score)', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')

			computeGlobalScores()

			assert.equal(ENTRIES.entries[0], undefined)
		})
	})
})
