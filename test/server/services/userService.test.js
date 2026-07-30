import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { getEntryByName, saveEntry } from '../../../src/server/repository/entriesRepository.js'
import { addAccount, getAccount } from '../../../src/server/repository/accountsRepository.js'
import { getUser, saveUser } from '../../../src/server/repository/userRepository.js'
import { saveUserScores } from '../../../src/server/repository/userEntryRepository.js'
import { DirectQuiz } from '../../../src/server/model/quizModel.js'
import { computeUserScores } from '../../../src/server/services/scoresComputerService.js'
import {
	returnUserData, returnPublicUserData, getUserEntities, getUserQuizPaginated, deleteAccount,
} from '../../../src/server/services/userService.js'

function fakeRes() {
	const res = {}
	res.json = (body) => { res.body = body; return res }
	return res
}

/** Persists `user`'s current quiz as its user_entry scores, mirroring what
 * quizRoutes.js's recomputeAndPersist() does right after a real vote. */
async function persistScores(sqlite, user) {
	const {scores} = computeUserScores(user.quiz, {})
	user.entries = scores
	await saveUserScores(sqlite, user.username, scores)
}

describe('userService', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(() => { sqlite = db.sqlite })

	describe('returnUserData', () => {
		test('reports scoredEntriesCount recomputed from the user\'s current votes', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'A', true)
			const user = await getUser(sqlite, 'bobby')
			user.displayLogin = 'Bobby'
			user.quiz.push(new DirectQuiz(entry, 0.5))
			await saveUser(sqlite, user)
			await persistScores(sqlite, user)

			const res = fakeRes()
			await returnUserData(sqlite, {user}, res)

			assert.equal(res.body.username, 'Bobby')
			assert.equal(res.body.scoredEntriesCount, 1)
			assert.equal(res.body.isAdmin, false)
		})
	})

	describe('getUserQuizPaginated', () => {
		test('enriches direct quiz entries with the entry label', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'Naruto', true)
			const user = await getUser(sqlite, 'bobby')
			user.didQuiz(new DirectQuiz(entry, 0.7))

			const result = await getUserQuizPaginated(sqlite, user, {})

			assert.equal(result.items.length, 1)
			assert.equal(result.items[0].entryLabel, 'Naruto')
		})
	})

	describe('getUserEntities', () => {
		test('paginates the user\'s scored entries, recomputed from votes', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, 'A', true)
			const b = await getEntryByName(sqlite, 'B', true)
			const user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DirectQuiz(a, 0), new DirectQuiz(b, 1))
			await saveUser(sqlite, user)
			await persistScores(sqlite, user)

			const result = await getUserEntities(sqlite, user, {page: 1, limit: 10})

			assert.equal(result.total, 2)
			assert.ok(result.items.every((i) => i.label))
		})

		test('sort=label resolves entry names for sorting', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const zebra = await getEntryByName(sqlite, 'Zebra', true)
			const apple = await getEntryByName(sqlite, 'Apple', true)
			const user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DirectQuiz(zebra, 0.5), new DirectQuiz(apple, 0.5))
			await saveUser(sqlite, user)
			await persistScores(sqlite, user)

			const result = await getUserEntities(sqlite, user, {sort: 'label', order: 'asc', page: 1, limit: 10})

			assert.deepEqual(result.items.map((i) => i.label), ['Apple', 'Zebra'])
		})
	})

	describe('returnPublicUserData (getPublicUserData)', () => {
		test('returns null for an unknown account', async () => {
			assert.equal(await returnPublicUserData(sqlite, 'ghost', {}), null)
		})

		test('returns null for a ghost account with no credentials yet', async () => {
			await sqlite.run(
				"INSERT INTO accounts (username, display_login, password_hash, salt) VALUES ('ghosty', 'Ghosty', NULL, NULL)"
			)
			assert.equal(await returnPublicUserData(sqlite, 'ghosty', {}), null)
		})

		test('returns the display login and paginated computed scores', async () => {
			await addAccount(sqlite, 'Bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'A', true)
			entry.globalScore = 0.6
			await saveEntry(sqlite, entry)
			const user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DirectQuiz(entry, 1))
			await saveUser(sqlite, user)
			await persistScores(sqlite, user)

			const data = await returnPublicUserData(sqlite, 'bobby', {page: 1, limit: 10})

			assert.equal(data.username, 'Bobby')
			assert.equal(data.total, 1)
		})
	})

	describe('deleteAccount', () => {
		test('removes the account row (cascading to its quiz data)', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const entry = await getEntryByName(sqlite, 'A', true)
			const user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DirectQuiz(entry, 1))
			await saveUser(sqlite, user)

			await deleteAccount(sqlite, 'bobby')

			assert.equal(await getAccount(sqlite, 'bobby'), null)
			const directRows = await sqlite.all('SELECT * FROM direct_quiz WHERE username = ?', ['bobby'])
			assert.equal(directRows.length, 0)
		})
	})
})
