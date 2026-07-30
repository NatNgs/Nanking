import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { getEntryByName, getEntryById } from '../../../src/server/repository/entriesRepository.js'
import { DirectQuiz, DualQuiz } from '../../../src/server/model/quizModel.js'
import { computeUserScores, computeGlobalScores } from '../../../src/server/services/scoresComputerService.js'

function assertFinite(value, message) {
	assert.equal(typeof value, 'number', message)
	assert.equal(Number.isFinite(value), true, message)
}

const TOPIC = 'anime'

describe('scoresComputerService', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	describe('computeUserScores', () => {
		test('averages a single default vote with the entry\'s global score', () => {
			const entry = { id: 'n:0', globalScore: 0.5 }
			const {scores} = computeUserScores([new DirectQuiz(entry, 1)], {})

			assertFinite(scores[entry.id])
			assert.equal(scores[entry.id], (1 + 0.5) / 2)
		})

		test('never produces NaN/undefined/null even with a single entry', () => {
			const entry = { id: 'n:0', globalScore: 0.5 }
			const {scores} = computeUserScores([new DirectQuiz(entry, 0)], {})

			assertFinite(scores[entry.id])
		})

		test('averages a dual vote against both entries\' global scores', () => {
			const a = { id: 'n:0', globalScore: 0.5 }
			const b = { id: 'n:1', globalScore: 0.5 }
			const {scores} = computeUserScores([new DualQuiz(a, b, 1)], {})

			assertFinite(scores[a.id])
			assertFinite(scores[b.id])
		})

		test('re-running with an already-computed score keeps averaging with the global score, no NaN', () => {
			const entry = { id: 'n:0', globalScore: 0.5 }
			const quiz = [new DirectQuiz(entry, 0)]

			let {scores} = computeUserScores(quiz, {})
			;({scores} = computeUserScores(quiz, scores))
			;({scores} = computeUserScores(quiz, scores))

			assertFinite(scores[entry.id])
		})

		test('drops an entry no longer referenced by any quiz', () => {
			const entry = { id: 'n:0', globalScore: 0.5 }
			const {scores} = computeUserScores([], {[entry.id]: 0.7})

			assert.equal(Object.hasOwn(scores, entry.id), false)
		})

		test('totalChange is 0 once the score has stabilized', () => {
			const entry = { id: 'n:0', globalScore: 0.5 }
			const quiz = [new DirectQuiz(entry, 0)]

			const first = computeUserScores(quiz, {})
			const second = computeUserScores(quiz, first.scores)

			assert.equal(second.totalChange, 0)
		})

		test('totalChange counts a newly appearing entry at its full score', () => {
			const entry = { id: 'n:0', globalScore: 0.5 }
			const {scores, totalChange} = computeUserScores([new DirectQuiz(entry, 1)], {})

			assert.equal(totalChange, scores[entry.id])
		})
	})

	describe('computeGlobalScores', () => {
		test('falls back to 0.5 when there is a single entry (no variance to stretch)', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)

			await computeGlobalScores(sqlite, TOPIC, {[entry.id]: [0.3]})

			const reloaded = await getEntryById(sqlite, TOPIC, entry.id)
			assert.equal(reloaded.globalScore, 0.5)
		})

		test('falls back to 0.5 when every entry\'s score is tied', async () => {
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)

			await computeGlobalScores(sqlite, TOPIC, {[a.id]: [0.4], [b.id]: [0.4]})

			assert.equal((await getEntryById(sqlite, TOPIC, a.id)).globalScore, 0.5)
			assert.equal((await getEntryById(sqlite, TOPIC, b.id)).globalScore, 0.5)
		})

		test('stretches distinct scores to the full 0-1 range', async () => {
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)

			await computeGlobalScores(sqlite, TOPIC, {[a.id]: [0], [b.id]: [1]})

			const reloadedA = await getEntryById(sqlite, TOPIC, a.id)
			const reloadedB = await getEntryById(sqlite, TOPIC, b.id)
			assertFinite(reloadedA.globalScore)
			assertFinite(reloadedB.globalScore)
			assert.equal(reloadedA.globalScore, 0)
			assert.equal(reloadedB.globalScore, 1)
		})

		test('keeps an entry alive with its previous global_score unchanged when it has no real user score yet', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)

			await computeGlobalScores(sqlite, TOPIC, {})

			const reloaded = await getEntryById(sqlite, TOPIC, entry.id)
			assert.ok(reloaded, 'a freshly created, not-yet-voted-on entry must survive a computation cycle')
			assert.equal(reloaded.globalScore, 0.5)
		})

		test('never leaves a NaN globalScore after repeated cycles, even starting from a single entry', async () => {
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)

			await computeGlobalScores(sqlite, TOPIC, {[a.id]: [0]})
			assertFinite((await getEntryById(sqlite, TOPIC, a.id)).globalScore)

			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			for(let i = 0; i < 3; i++) {
				const currentA = await getEntryById(sqlite, TOPIC, a.id)
				await computeGlobalScores(sqlite, TOPIC, {[a.id]: [currentA.globalScore], [b.id]: [1]})
			}

			assertFinite((await getEntryById(sqlite, TOPIC, a.id)).globalScore)
			assertFinite((await getEntryById(sqlite, TOPIC, b.id)).globalScore)
		})
	})
})
