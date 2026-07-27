import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import {
	getUser, userExists, anyUserReferencesEntry, removeUserReferencesToEntry,
	saveUser, getAllUsernames, normalizeDualQuiz,
} from '../../../src/server/data/userRepository.js'
import { getEntryByName } from '../../../src/server/data/entriesRepository.js'
import { addAccount } from '../../../src/server/data/accountsRepository.js'
import { DirectQuiz, DualQuiz } from '../../../src/server/data/quizModel.js'

describe('userRepository', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(() => { sqlite = db.sqlite })

	describe('userExists / getUser', () => {
		test('getUser returns null for an unknown username', async () => {
			assert.equal(await getUser(sqlite, 'ghost'), null)
		})

		test('getUser returns null for a ghost account with no credentials yet', async () => {
			await sqlite.run(
				"INSERT INTO accounts (username, display_login, password_hash, salt) VALUES ('ghosty', 'Ghosty', NULL, NULL)"
			)
			assert.equal(await userExists(sqlite, 'ghosty'), false)
			assert.equal(await getUser(sqlite, 'ghosty'), null)
		})

		test('getUser returns a User with an empty quiz for a fresh account', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const user = await getUser(sqlite, 'bobby')
			assert.equal(user.username, 'bobby')
			assert.deepEqual(user.quiz, [])
		})
	})

	describe('loadUserQuiz (via getUser) / saveUser round-trip', () => {
		test('a direct quiz round-trips with its Entry resolved and value/ts preserved', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'Naruto', true)
			const user = await getUser(sqlite, 'bobby')
			const quiz = new DirectQuiz(entry, 0.7)
			quiz.ts = 1234
			user.quiz.push(quiz)

			await saveUser(sqlite, user)

			const reloaded = await getUser(sqlite, 'bobby')
			assert.equal(reloaded.quiz.length, 1)
			assert.equal(reloaded.quiz[0].type, 'direct')
			assert.equal(reloaded.quiz[0].entry.id, entry.id)
			assert.equal(reloaded.quiz[0].value, 0.7)
			assert.equal(reloaded.quiz[0].ts, 1234)
		})

		test('a dual quiz round-trips with both Entries resolved', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const neg = await getEntryByName(sqlite, 'A', true)
			const pos = await getEntryByName(sqlite, 'B', true)
			const user = await getUser(sqlite, 'bobby')
			const quiz = new DualQuiz(neg, pos, 1)
			quiz.ts = 5678
			user.quiz.push(quiz)

			await saveUser(sqlite, user)

			const reloaded = await getUser(sqlite, 'bobby')
			assert.equal(reloaded.quiz.length, 1)
			assert.equal(reloaded.quiz[0].type, 'dual')
		})

		test('quiz history is merged chronologically across direct and dual', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, 'A', true)
			const b = await getEntryByName(sqlite, 'B', true)
			const user = await getUser(sqlite, 'bobby')
			const q1 = new DirectQuiz(a, 0.5); q1.ts = 100
			const q2 = new DualQuiz(a, b, 1); q2.ts = 50
			user.quiz.push(q1, q2)
			await saveUser(sqlite, user)

			const reloaded = await getUser(sqlite, 'bobby')
			assert.deepEqual(reloaded.quiz.map((q) => q.ts), [50, 100])
		})

		test('saveUser removes a quiz row deleted from memory since the last save', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'Naruto', true)
			const user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DirectQuiz(entry, 0.5))
			await saveUser(sqlite, user)

			user.quiz = []
			await saveUser(sqlite, user)

			const reloaded = await getUser(sqlite, 'bobby')
			assert.equal(reloaded.quiz.length, 0)
		})

		test('a dual quiz is normalized to alphanumeric neg/pos order in storage', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const zEntry = await getEntryByName(sqlite, 'Z-named', true) // id n:0
			const aEntry = await getEntryByName(sqlite, 'A-named', true) // id n:1
			// zEntry.id ('n:0') < aEntry.id ('n:1') alphanumerically already, so
			// force the reversed case by using ids directly instead of relying on creation order
			const user = await getUser(sqlite, 'bobby')
			const quiz = new DualQuiz(aEntry, zEntry, 1) // neg=n:1, pos=n:0 - reversed order
			user.quiz.push(quiz)
			await saveUser(sqlite, user)

			const row = await sqlite.get('SELECT neg_id, pos_id, value FROM dual_quiz WHERE username = ?', ['bobby'])
			assert.equal(row.neg_id <= row.pos_id, true)
		})
	})

	describe('anyUserReferencesEntry / removeUserReferencesToEntry', () => {
		test('returns true when a user has a direct vote referencing the entry', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'Naruto', true)
			const user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DirectQuiz(entry, 0.5))
			await saveUser(sqlite, user)

			assert.equal(await anyUserReferencesEntry(sqlite, entry.id), true)
		})

		test('returns true when a user has a dual vote referencing the entry (either side)', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, 'A', true)
			const b = await getEntryByName(sqlite, 'B', true)
			const user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DualQuiz(a, b, 1))
			await saveUser(sqlite, user)

			assert.equal(await anyUserReferencesEntry(sqlite, b.id), true)
		})

		test('returns false when no user references the entry', async () => {
			const entry = await getEntryByName(sqlite, 'Naruto', true)
			assert.equal(await anyUserReferencesEntry(sqlite, entry.id), false)
		})

		test('removeUserReferencesToEntry removes only this user\'s votes on the entry', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			await addAccount(sqlite, 'alice', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'Naruto', true)
			const bobby = await getUser(sqlite, 'bobby')
			bobby.quiz.push(new DirectQuiz(entry, 0.5))
			await saveUser(sqlite, bobby)
			const alice = await getUser(sqlite, 'alice')
			alice.quiz.push(new DirectQuiz(entry, 0.9))
			await saveUser(sqlite, alice)

			await removeUserReferencesToEntry(sqlite, 'bobby', entry.id)

			assert.equal((await getUser(sqlite, 'bobby')).quiz.length, 0)
			assert.equal((await getUser(sqlite, 'alice')).quiz.length, 1)
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
})
