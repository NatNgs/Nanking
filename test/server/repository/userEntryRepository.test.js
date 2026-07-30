import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { addAccount, removeAccount } from '../../../src/server/repository/accountsRepository.js'
import { getEntryByName, deleteEntry } from '../../../src/server/repository/entriesRepository.js'
import { getUserScores, saveUserScores, getScoresForEntry } from '../../../src/server/repository/userEntryRepository.js'

const TOPIC = 'anime'

describe('userEntryRepository', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	describe('getUserScores', () => {
		test('returns an empty object for a user with no score yet', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {})
		})
	})

	describe('saveUserScores / getUserScores round-trip', () => {
		test('persists and reloads every entry score', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)

			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3, [b.id]: 0.7})

			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {[a.id]: 0.3, [b.id]: 0.7})
		})

		test('a later save fully resyncs: entries missing from the new scores are removed', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3, [b.id]: 0.7})

			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.5})

			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {[a.id]: 0.5})
		})

		test('saving an empty score set removes every row for this user', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3})

			await saveUserScores(sqlite, TOPIC, 'bobby', {})

			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {})
		})

		test('updates the score in place when the entry is saved again', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3})

			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.9})

			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {[a.id]: 0.9})
		})

		test('does not affect another user\'s scores', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			await addAccount(sqlite, 'alice', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3})
			await saveUserScores(sqlite, TOPIC, 'alice', {[a.id]: 0.9})

			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {[a.id]: 0.3})
			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'alice'), {[a.id]: 0.9})
		})

		test('a resync in one topic never touches the same user\'s scores in another topic', async () => {
			await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', ['movies', 'Movies'])
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const animeEntry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const movieEntry = await getEntryByName(sqlite, 'movies', 'A', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[animeEntry.id]: 0.3})
			await saveUserScores(sqlite, 'movies', 'bobby', {[movieEntry.id]: 0.9})

			// Resyncing the "anime" topic to an empty score set must not purge "movies"
			await saveUserScores(sqlite, TOPIC, 'bobby', {})

			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {})
			assert.deepEqual(await getUserScores(sqlite, 'movies', 'bobby'), {[movieEntry.id]: 0.9})
		})
	})

	describe('getScoresForEntry', () => {
		test('returns every user\'s score on a given entry', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			await addAccount(sqlite, 'alice', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3})
			await saveUserScores(sqlite, TOPIC, 'alice', {[a.id]: 0.9})

			assert.deepEqual(await getScoresForEntry(sqlite, TOPIC, a.id), {bobby: 0.3, alice: 0.9})
		})

		test('returns an empty object for an entry with no score yet', async () => {
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			assert.deepEqual(await getScoresForEntry(sqlite, TOPIC, a.id), {})
		})
	})

	describe('cascade deletes', () => {
		test('removing the account also removes its user_entry rows', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3})

			await removeAccount(sqlite, 'bobby')

			assert.deepEqual(await getScoresForEntry(sqlite, TOPIC, a.id), {})
		})

		test('removing the entry also removes its user_entry rows', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			await saveUserScores(sqlite, TOPIC, 'bobby', {[a.id]: 0.3})

			await deleteEntry(sqlite, TOPIC, a.id)

			assert.deepEqual(await getUserScores(sqlite, TOPIC, 'bobby'), {})
		})
	})
})
