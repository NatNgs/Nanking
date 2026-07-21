import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { Manager } from '../../../src/server/data/db.js'
import { User, ALL_USERS } from '../../../src/server/data/user.js'
import { EntriesManager, Entry } from '../../../src/server/data/entries.js'
import ENTRIES from '../../../src/server/data/entries.js'
import TAGS from '../../../src/server/data/tags.js'
import { Tag } from '../../../src/server/data/tags.js'
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
		for(const key in TAGS.tags) delete TAGS.tags[key]
	})

	describe('computeUserScores', () => {
		test('averages a single default vote with the entry\'s global score', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].globalScore = 0.5
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 1)])

			computeUserScores(user)

			assertFinite(user.entries['n:0'])
			assert.equal(user.entries['n:0'], (1 + 0.5) / 2)
		})

		test('never produces NaN/undefined/null even with a single entry', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 0)])

			computeUserScores(user)

			assertFinite(user.entries['n:0'])
		})

		test('averages a dual vote against both entries\' global scores', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
			const user = makeUser('bobby', [new DualQuiz(ENTRIES.entries['n:0'], ENTRIES.entries['n:1'], 1)])

			computeUserScores(user)

			assertFinite(user.entries['n:0'])
			assertFinite(user.entries['n:1'])
		})

		test('re-running with an already-computed score keeps averaging with the global score, no NaN', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 0)])

			computeUserScores(user)
			computeUserScores(user)
			computeUserScores(user)

			assertFinite(user.entries['n:0'])
		})
	})

	describe('computeGlobalScores', () => {
		test('falls back to 0.5 when there is a single entry (no variance to stretch)', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0.3
			ALL_USERS.bobby = user

			computeGlobalScores()

			assert.equal(ENTRIES.entries['n:0'].globalScore, 0.5)
		})

		test('falls back to 0.5 when every entry\'s score is tied', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0.4
			user.entries['n:1'] = 0.4
			ALL_USERS.bobby = user

			computeGlobalScores()

			assert.equal(ENTRIES.entries['n:0'].globalScore, 0.5)
			assert.equal(ENTRIES.entries['n:1'].globalScore, 0.5)
		})

		test('stretches distinct scores to the full 0-1 range', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0
			user.entries['n:1'] = 1
			ALL_USERS.bobby = user

			computeGlobalScores()

			assertFinite(ENTRIES.entries['n:0'].globalScore)
			assertFinite(ENTRIES.entries['n:1'].globalScore)
			assert.equal(ENTRIES.entries['n:0'].globalScore, 0)
			assert.equal(ENTRIES.entries['n:1'].globalScore, 1)
		})

		test('never leaves a NaN globalScore after repeated cycles, even starting from a single entry', () => {
			// Reproduces the real-world sequence: an entry is created and voted
			// on alone first (triggering the single-entry fallback), then a
			// second entry is added and voted on in a later cycle.
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 0)])
			ALL_USERS.bobby = user

			computeUserScores(user)
			computeGlobalScores()
			assertFinite(ENTRIES.entries['n:0'].globalScore)

			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
			user.quiz.push(new DefaultValueQuiz(ENTRIES.entries['n:1'], 1))

			for(let i = 0; i < 3; i++) {
				computeUserScores(user)
				computeGlobalScores()
			}

			assertFinite(ENTRIES.entries['n:0'].globalScore)
			assertFinite(ENTRIES.entries['n:1'].globalScore)
			assertFinite(user.entries['n:0'])
			assertFinite(user.entries['n:1'])
		})

		test('removes an entry that only the initial global score accounts for (no real user score)', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')

			computeGlobalScores()

			assert.equal(ENTRIES.entries['n:0'], undefined)
		})
	})

	describe('computeUserScores no longer factors in tag scores', () => {
		test('a user score on an entry is unaffected by its tags\' user scores', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].globalScore = 0.5
			ENTRIES.entries['n:0'].tags.push('t:0')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')

			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 1)])
			user.tags['t:0'] = 0.9

			computeUserScores(user)

			// quiz vote (1) + globalScore (0.5) only, averaged — tag score ignored
			assertFinite(user.entries['n:0'])
			assert.equal(user.entries['n:0'], (1 + 0.5) / 2)
		})
	})

	describe('computeUserTagScores (via computeUserScores)', () => {
		test('a tag\'s user score averages the user scores of entries directly tagged with it', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].tags.push('t:0')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')

			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 1)])
			computeUserScores(user)

			assertFinite(user.tags['t:0'])
			assert.equal(user.tags['t:0'], user.entries['n:0'])
		})

		test('a tag\'s user score also averages in its already-computed direct children\'s user scores', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Cat entry')
			ENTRIES.entries['n:0'].tags.push('t:1') // Cat
			ENTRIES.entries['n:1'] = new Entry('n:1', 'Animal entry')
			ENTRIES.entries['n:1'].tags.push('t:0') // Animal

			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Cat')
			TAGS.tags['t:1'].parents.push('t:0') // Cat -> Animal

			const user = makeUser('bobby', [
				new DefaultValueQuiz(ENTRIES.entries['n:0'], 1),
				new DefaultValueQuiz(ENTRIES.entries['n:1'], 0),
			])
			computeUserScores(user)

			assertFinite(user.tags['t:1']) // Cat: only from n:0 (Cat entry)
			assertFinite(user.tags['t:0']) // Animal: n:1 (Animal entry) + Cat's already-computed score
			assert.equal(user.tags['t:1'], user.entries['n:0'])
			assert.equal(user.tags['t:0'], (user.entries['n:1'] + user.tags['t:1']) / 2)
		})

		test('a tag with no scorable entry or child is left untouched (stays absent, no 0.5 fallback)', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Unused')
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 1)])

			computeUserScores(user)

			assert.equal('t:0' in user.tags, false)
		})

		test('computes correctly regardless of the order tags were declared/voted in', () => {
			// Declare the parent before the child, and vote on the child's entry
			// last: topologicalOrder must still process the child before the parent.
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Cat')
			TAGS.tags['t:1'].parents.push('t:0')

			ENTRIES.entries['n:0'] = new Entry('n:0', 'Cat entry')
			ENTRIES.entries['n:0'].tags.push('t:1')

			const user = makeUser('bobby', [new DefaultValueQuiz(ENTRIES.entries['n:0'], 1)])
			computeUserScores(user)

			assertFinite(user.tags['t:1'])
			assertFinite(user.tags['t:0'])
		})
	})

	describe('computeGlobalScores no longer factors in tag scores', () => {
		test('an entry\'s globalScore is unaffected by its tags\' global score', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].tags.push('t:0')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:0'].score = 0.9

			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0.3
			ALL_USERS.bobby = user

			computeGlobalScores()

			// Single user score -> single-entry fallback (no variance to stretch)
			assert.equal(ENTRIES.entries['n:0'].globalScore, 0.5)
		})

		test('without any tag defined, behaves exactly like before (non-regression)', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0
			user.entries['n:1'] = 1
			ALL_USERS.bobby = user

			computeGlobalScores()

			assert.equal(ENTRIES.entries['n:0'].globalScore, 0)
			assert.equal(ENTRIES.entries['n:1'].globalScore, 1)
		})
	})

	describe('computeGlobalTagScores (via computeGlobalScores)', () => {
		test('a tag\'s global score averages the globalScore of entries directly tagged with it', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].globalScore = 0.5
			ENTRIES.entries['n:0'].tags.push('t:0')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')

			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0.5
			ALL_USERS.bobby = user

			computeGlobalScores()

			assertFinite(TAGS.tags['t:0'].score)
		})

		test('a tag\'s global score also averages in its direct children\'s already-computed global scores', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Cat entry')
			ENTRIES.entries['n:0'].tags.push('t:1') // Cat
			ENTRIES.entries['n:1'] = new Entry('n:1', 'Animal entry')
			ENTRIES.entries['n:1'].tags.push('t:0') // Animal

			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Cat')
			TAGS.tags['t:1'].parents.push('t:0') // Cat -> Animal

			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0.2
			user.entries['n:1'] = 0.8
			ALL_USERS.bobby = user

			computeGlobalScores()

			assertFinite(TAGS.tags['t:1'].score)
			assertFinite(TAGS.tags['t:0'].score)
		})

		test('a tag with no scorable entry or child keeps its previous score unchanged (no reset, no NaN)', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Unused')
			TAGS.tags['t:0'].score = 0.42
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0.3
			ALL_USERS.bobby = user

			computeGlobalScores()

			assert.equal(TAGS.tags['t:0'].score, 0.42)
		})

		test('tag scores are never stretched min-max, unlike entry globalScore', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].tags.push('t:0')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
			ENTRIES.entries['n:1'].tags.push('t:0')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')

			const user = makeUser('bobby', [])
			user.entries['n:0'] = 0
			user.entries['n:1'] = 1
			ALL_USERS.bobby = user

			computeGlobalScores()

			// Entry scores are stretched to 0/1, but the tag score is a plain
			// average of its entries' (already stretched) globalScore, not
			// itself re-stretched against other tags.
			const expected = (ENTRIES.entries['n:0'].globalScore + ENTRIES.entries['n:1'].globalScore) / 2
			assert.equal(TAGS.tags['t:0'].score, expected)
		})
	})
})
