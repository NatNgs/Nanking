import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { getEntryByName, getEntryById, saveEntry } from '../../../src/server/data/entriesRepository.js'
import { addAccount } from '../../../src/server/data/accountsRepository.js'
import { getUser, saveUser } from '../../../src/server/data/userRepository.js'
import { DirectQuiz, DualQuiz } from '../../../src/server/data/quizModel.js'
import { computeUserScores, computeGlobalScores } from '../../../src/server/services/scoresComputerService.js'

function assertFinite(value, message) {
	assert.equal(typeof value, 'number', message)
	assert.equal(Number.isFinite(value), true, message)
}

describe('scoresComputerService', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(() => { sqlite = db.sqlite })

	async function makeUser(username, quizFactory) {
		await addAccount(sqlite, username, 'hashedpwd')
		const user = await getUser(sqlite, username)
		if(quizFactory) user.quiz = await quizFactory()
		return user
	}

	describe('computeUserScores', () => {
		test('averages a single default vote with the entry\'s global score', async () => {
			const entry = await getEntryByName(sqlite, 'A', true)
			entry.globalScore = 0.5
			await saveEntry(sqlite, entry)
			const user = await makeUser('bobby', () => [new DirectQuiz(entry, 1)])

			await computeUserScores(sqlite, user)

			assertFinite(user.entries[entry.id])
			assert.equal(user.entries[entry.id], (1 + 0.5) / 2)
		})

		test('never produces NaN/undefined/null even with a single entry', async () => {
			const entry = await getEntryByName(sqlite, 'A', true)
			const user = await makeUser('bobby', () => [new DirectQuiz(entry, 0)])

			await computeUserScores(sqlite, user)

			assertFinite(user.entries[entry.id])
		})

		test('averages a dual vote against both entries\' global scores', async () => {
			const a = await getEntryByName(sqlite, 'A', true)
			const b = await getEntryByName(sqlite, 'B', true)
			const user = await makeUser('bobby', () => [new DualQuiz(a, b, 1)])

			await computeUserScores(sqlite, user)

			assertFinite(user.entries[a.id])
			assertFinite(user.entries[b.id])
		})

		test('re-running with an already-computed score keeps averaging with the global score, no NaN', async () => {
			const entry = await getEntryByName(sqlite, 'A', true)
			const user = await makeUser('bobby', () => [new DirectQuiz(entry, 0)])

			await computeUserScores(sqlite, user)
			await computeUserScores(sqlite, user)
			await computeUserScores(sqlite, user)

			assertFinite(user.entries[entry.id])
		})

		test('does not persist user.entries anywhere - recomputed fresh from votes each time', async () => {
			const entry = await getEntryByName(sqlite, 'A', true)
			const user = await makeUser('bobby', () => [new DirectQuiz(entry, 1)])
			await computeUserScores(sqlite, user)
			await saveUser(sqlite, user)

			const reloaded = await getUser(sqlite, 'bobby')
			assert.deepEqual(reloaded.entries, {}) // freshly loaded, not yet recomputed
			await computeUserScores(sqlite, reloaded)
			assert.equal(reloaded.entries[entry.id], user.entries[entry.id])
		})
	})

	describe('computeGlobalScores', () => {
		test('falls back to 0.5 when there is a single entry (no variance to stretch)', async () => {
			const entry = await getEntryByName(sqlite, 'A', true)
			const user = await makeUser('bobby', () => [new DirectQuiz(entry, 0.3)])
			await saveUser(sqlite, user)

			await computeGlobalScores(sqlite)

			const reloaded = await getEntryById(sqlite, entry.id)
			assert.equal(reloaded.globalScore, 0.5)
		})

		test('falls back to 0.5 when every entry\'s score is tied', async () => {
			const a = await getEntryByName(sqlite, 'A', true)
			const b = await getEntryByName(sqlite, 'B', true)
			const user = await makeUser('bobby', () => [new DirectQuiz(a, 0.4), new DirectQuiz(b, 0.4)])
			await saveUser(sqlite, user)

			await computeGlobalScores(sqlite)

			assert.equal((await getEntryById(sqlite, a.id)).globalScore, 0.5)
			assert.equal((await getEntryById(sqlite, b.id)).globalScore, 0.5)
		})

		test('stretches distinct scores to the full 0-1 range', async () => {
			const a = await getEntryByName(sqlite, 'A', true)
			const b = await getEntryByName(sqlite, 'B', true)
			const user = await makeUser('bobby', () => [new DirectQuiz(a, 0), new DirectQuiz(b, 1)])
			await saveUser(sqlite, user)

			await computeGlobalScores(sqlite)

			const reloadedA = await getEntryById(sqlite, a.id)
			const reloadedB = await getEntryById(sqlite, b.id)
			assertFinite(reloadedA.globalScore)
			assertFinite(reloadedB.globalScore)
			assert.equal(reloadedA.globalScore, 0)
			assert.equal(reloadedB.globalScore, 1)
		})

		test('keeps an entry alive with its previous global_score unchanged when it has no real user score yet', async () => {
			const entry = await getEntryByName(sqlite, 'A', true)

			await computeGlobalScores(sqlite)

			const reloaded = await getEntryById(sqlite, entry.id)
			assert.ok(reloaded, 'a freshly created, not-yet-voted-on entry must survive a computation cycle')
			assert.equal(reloaded.globalScore, 0.5)
		})

		test('never leaves a NaN globalScore after repeated cycles, even starting from a single entry', async () => {
			const a = await getEntryByName(sqlite, 'A', true)
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			let user = await getUser(sqlite, 'bobby')
			user.quiz = [new DirectQuiz(a, 0)]
			await saveUser(sqlite, user)

			await computeUserScores(sqlite, user)
			await computeGlobalScores(sqlite)
			assertFinite((await getEntryById(sqlite, a.id)).globalScore)

			const b = await getEntryByName(sqlite, 'B', true)
			user = await getUser(sqlite, 'bobby')
			user.quiz.push(new DirectQuiz(b, 1))
			await saveUser(sqlite, user)

			for(let i = 0; i < 3; i++) {
				user = await getUser(sqlite, 'bobby')
				await computeUserScores(sqlite, user)
				await computeGlobalScores(sqlite)
			}

			assertFinite((await getEntryById(sqlite, a.id)).globalScore)
			assertFinite((await getEntryById(sqlite, b.id)).globalScore)
		})
	})
})
