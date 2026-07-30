import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import {
	getUser, userExists, anyUserReferencesEntry, removeUserReferencesToEntry,
	saveUser, getAllUsernames, normalizeDualQuiz, getUserDualStats,
} from '../../../src/server/repository/userRepository.js'
import { getEntryByName } from '../../../src/server/repository/entriesRepository.js'
import { addAccount } from '../../../src/server/repository/accountsRepository.js'
import { DirectQuiz, DualQuiz } from '../../../src/server/model/quizModel.js'

const TOPIC = 'anime'

describe('userRepository', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	describe('userExists / getUser', () => {
		test('getUser returns null for an unknown username', async () => {
			assert.equal(await getUser(sqlite, TOPIC, 'ghost'), null)
		})

		test('getUser returns null for a ghost account with no credentials yet', async () => {
			await sqlite.run(
				"INSERT INTO accounts (username, display_login, password_hash, salt) VALUES ('ghosty', 'Ghosty', NULL, NULL)"
			)
			assert.equal(await userExists(sqlite, 'ghosty'), false)
			assert.equal(await getUser(sqlite, TOPIC, 'ghosty'), null)
		})

		test('getUser returns a User with an empty quiz for a fresh account', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const user = await getUser(sqlite, TOPIC, 'bobby')
			assert.equal(user.username, 'bobby')
			assert.deepEqual(user.quiz, [])
		})
	})

	describe('loadUserQuiz (via getUser) / saveUser round-trip', () => {
		test('a direct quiz round-trips with its Entry resolved and value/ts preserved', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const user = await getUser(sqlite, TOPIC, 'bobby')
			const quiz = new DirectQuiz(entry, 0.7)
			quiz.ts = 1234
			user.quiz.push(quiz)

			await saveUser(sqlite, TOPIC, user)

			const reloaded = await getUser(sqlite, TOPIC, 'bobby')
			assert.equal(reloaded.quiz.length, 1)
			assert.equal(reloaded.quiz[0].type, 'direct')
			assert.equal(reloaded.quiz[0].entry.id, entry.id)
			assert.equal(reloaded.quiz[0].value, 0.7)
			assert.equal(reloaded.quiz[0].ts, 1234)
		})

		test('a dual quiz round-trips with both Entries resolved', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const neg = await getEntryByName(sqlite, TOPIC, 'A', true)
			const pos = await getEntryByName(sqlite, TOPIC, 'B', true)
			const user = await getUser(sqlite, TOPIC, 'bobby')
			const quiz = new DualQuiz(neg, pos, 1)
			quiz.ts = 5678
			user.quiz.push(quiz)

			await saveUser(sqlite, TOPIC, user)

			const reloaded = await getUser(sqlite, TOPIC, 'bobby')
			assert.equal(reloaded.quiz.length, 1)
			assert.equal(reloaded.quiz[0].type, 'dual')
		})

		test('quiz history is merged chronologically across direct and dual', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			const user = await getUser(sqlite, TOPIC, 'bobby')
			const q1 = new DirectQuiz(a, 0.5); q1.ts = 100
			const q2 = new DualQuiz(a, b, 1); q2.ts = 50
			user.quiz.push(q1, q2)
			await saveUser(sqlite, TOPIC, user)

			const reloaded = await getUser(sqlite, TOPIC, 'bobby')
			assert.deepEqual(reloaded.quiz.map((q) => q.ts), [50, 100])
		})

		test('saveUser removes a quiz row deleted from memory since the last save', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const user = await getUser(sqlite, TOPIC, 'bobby')
			user.quiz.push(new DirectQuiz(entry, 0.5))
			await saveUser(sqlite, TOPIC, user)

			user.quiz = []
			await saveUser(sqlite, TOPIC, user)

			const reloaded = await getUser(sqlite, TOPIC, 'bobby')
			assert.equal(reloaded.quiz.length, 0)
		})

		test('a dual quiz is normalized to alphanumeric neg/pos order in storage', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const zEntry = await getEntryByName(sqlite, TOPIC, 'Z-named', true) // id n:0
			const aEntry = await getEntryByName(sqlite, TOPIC, 'A-named', true) // id n:1
			// zEntry.id ('n:0') < aEntry.id ('n:1') alphanumerically already, so
			// force the reversed case by using ids directly instead of relying on creation order
			const user = await getUser(sqlite, TOPIC, 'bobby')
			const quiz = new DualQuiz(aEntry, zEntry, 1) // neg=n:1, pos=n:0 - reversed order
			user.quiz.push(quiz)
			await saveUser(sqlite, TOPIC, user)

			const row = await sqlite.get(
				'SELECT neg_id, pos_id, value FROM dual_quiz WHERE topic_id = ? AND username = ?', [TOPIC, 'bobby']
			)
			assert.equal(row.neg_id <= row.pos_id, true)
		})
	})

	describe('anyUserReferencesEntry / removeUserReferencesToEntry', () => {
		test('returns true when a user has a direct vote referencing the entry', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const user = await getUser(sqlite, TOPIC, 'bobby')
			user.quiz.push(new DirectQuiz(entry, 0.5))
			await saveUser(sqlite, TOPIC, user)

			assert.equal(await anyUserReferencesEntry(sqlite, TOPIC, entry.id), true)
		})

		test('returns true when a user has a dual vote referencing the entry (either side)', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			const user = await getUser(sqlite, TOPIC, 'bobby')
			user.quiz.push(new DualQuiz(a, b, 1))
			await saveUser(sqlite, TOPIC, user)

			assert.equal(await anyUserReferencesEntry(sqlite, TOPIC, b.id), true)
		})

		test('returns false when no user references the entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			assert.equal(await anyUserReferencesEntry(sqlite, TOPIC, entry.id), false)
		})

		test('removeUserReferencesToEntry removes only this user\'s votes on the entry', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			await addAccount(sqlite, 'alice', 'hashedpwd')
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const bobby = await getUser(sqlite, TOPIC, 'bobby')
			bobby.quiz.push(new DirectQuiz(entry, 0.5))
			await saveUser(sqlite, TOPIC, bobby)
			const alice = await getUser(sqlite, TOPIC, 'alice')
			alice.quiz.push(new DirectQuiz(entry, 0.9))
			await saveUser(sqlite, TOPIC, alice)

			await removeUserReferencesToEntry(sqlite, TOPIC, 'bobby', entry.id)

			assert.equal((await getUser(sqlite, TOPIC, 'bobby')).quiz.length, 0)
			assert.equal((await getUser(sqlite, TOPIC, 'alice')).quiz.length, 1)
		})
	})

	describe('getAllUsernames', () => {
		test('lists only real accounts, excluding ghosts', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			await sqlite.run(
				"INSERT INTO accounts (username, display_login, password_hash, salt) VALUES ('ghosty', 'Ghosty', NULL, NULL)"
			)
			const usernames = await getAllUsernames(sqlite)
			assert.deepEqual(usernames, ['bobby'])
		})
	})

	describe('normalizeDualQuiz', () => {
		test('leaves an already-sorted pair unchanged', () => {
			assert.deepEqual(normalizeDualQuiz('n:0', 'n:1', 1), {negId: 'n:0', posId: 'n:1', value: 1})
		})

		test('flips a reversed pair and negates the value', () => {
			assert.deepEqual(normalizeDualQuiz('n:1', 'n:0', 1), {negId: 'n:0', posId: 'n:1', value: -1})
		})
	})

	describe('getUserDualStats', () => {
		async function pushDual(username, neg, pos, value, ts) {
			const user = await getUser(sqlite, TOPIC, username)
			const quiz = new DualQuiz(neg, pos, value)
			quiz.ts = ts
			user.quiz.push(quiz)
			await saveUser(sqlite, TOPIC, user)
		}

		test('returns empty maps for a user with no dual history', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const stats = await getUserDualStats(sqlite, TOPIC, 'bobby')
			assert.equal(stats.outgoing.size, 0)
			assert.equal(stats.dualCount.size, 0)
			assert.equal(stats.resultCounts.size, 0)
		})

		test('a decisive vote adds a single directed edge winner -> loser, and bumps both dualCounts', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			await pushDual('bobby', a, b, 1, 1) // neg=a, pos=b, value>0 -> b beats a

			const stats = await getUserDualStats(sqlite, TOPIC, 'bobby')
			assert.deepEqual(stats.outgoing.get(b.id), new Set([a.id]))
			assert.equal(stats.outgoing.has(a.id), false)
			assert.equal(stats.dualCount.get(a.id), 1)
			assert.equal(stats.dualCount.get(b.id), 1)
			assert.deepEqual(stats.resultCounts.get(a.id), {W: 0, L: 1, E: 0})
			assert.deepEqual(stats.resultCounts.get(b.id), {W: 1, L: 0, E: 0})
		})

		test('a decisive vote in the other direction (value<0) still points winner -> loser', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			await pushDual('bobby', a, b, -1, 1) // neg=a, pos=b, value<0 -> a beats b

			const stats = await getUserDualStats(sqlite, TOPIC, 'bobby')
			assert.deepEqual(stats.outgoing.get(a.id), new Set([b.id]))
			assert.deepEqual(stats.resultCounts.get(a.id), {W: 1, L: 0, E: 0})
			assert.deepEqual(stats.resultCounts.get(b.id), {W: 0, L: 1, E: 0})
		})

		test('a tie adds edges in both directions and counts as E for both entries', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			await pushDual('bobby', a, b, 0, 1)

			const stats = await getUserDualStats(sqlite, TOPIC, 'bobby')
			assert.deepEqual(stats.outgoing.get(a.id), new Set([b.id]))
			assert.deepEqual(stats.outgoing.get(b.id), new Set([a.id]))
			assert.deepEqual(stats.resultCounts.get(a.id), {W: 0, L: 0, E: 1})
			assert.deepEqual(stats.resultCounts.get(b.id), {W: 0, L: 0, E: 1})
		})

		test('two decisive votes converging on a common opponent do not chain: no edge between the two winners', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			const c = await getEntryByName(sqlite, TOPIC, 'C', true)
			await pushDual('bobby', a, b, 1, 1) // b beats a
			await pushDual('bobby', c, b, 1, 2) // b beats c

			const stats = await getUserDualStats(sqlite, TOPIC, 'bobby')
			// b points to both a and c, but neither a nor c points to the other
			assert.deepEqual(stats.outgoing.get(b.id), new Set([a.id, c.id]))
			assert.equal(stats.outgoing.has(a.id), false)
			assert.equal(stats.outgoing.has(c.id), false)
		})

		test('dualCount sums every dual referencing the entry, on either side', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			const c = await getEntryByName(sqlite, TOPIC, 'C', true)
			await pushDual('bobby', a, b, 1, 1)
			await pushDual('bobby', a, c, -1, 2)

			const stats = await getUserDualStats(sqlite, TOPIC, 'bobby')
			assert.equal(stats.dualCount.get(a.id), 2)
			assert.equal(stats.dualCount.get(b.id), 1)
			assert.equal(stats.dualCount.get(c.id), 1)
		})
	})
})
