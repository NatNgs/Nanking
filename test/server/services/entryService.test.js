import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { Jimp } from 'jimp'
import CONFIG from '../../../src/server/config/config.js'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { getEntryByName, getEntryById, saveEntry } from '../../../src/server/repository/entriesRepository.js'
import { getTagByLabel } from '../../../src/server/repository/tagsRepository.js'
import { addAccount } from '../../../src/server/repository/accountsRepository.js'
import { getUser, saveUser } from '../../../src/server/repository/userRepository.js'
import { DirectQuiz, DualQuiz } from '../../../src/server/model/quizModel.js'
import {
	getEntryData, renameEntry, updateEntryImage, deleteEntry, listEntries,
} from '../../../src/server/services/entryService.js'
import { addTagToEntry } from '../../../src/server/services/tagService.js'

// Isolate from the real ./data directory (and from other test files sharing the
// same CONFIG singleton) with a directory of this file's own: entryImageService
// (used internally by updateEntryImage/deleteEntry) reads CONFIG.DATA_DIR lazily,
// so mutating it here is enough.
CONFIG.DATA_DIR = 'test/tmp/data-entryService'
const IMAGES_DIR = CONFIG.DATA_DIR + '/entryImages'
const TOPIC = 'anime'

async function makePngBuffer(width, height) {
	const image = new Jimp({width, height, color: 0xff0000ff})
	return image.getBuffer('image/png')
}

describe('entryService', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})
	afterEach(() => {
		rmSync(IMAGES_DIR, {recursive: true, force: true})
	})

	async function makeUser(username) {
		await addAccount(sqlite, username, 'hashedpwd')
		return getUser(sqlite, TOPIC, username)
	}

	describe('getEntryData', () => {
		test('returns null for an unknown entry', async () => {
			assert.equal(await getEntryData(sqlite, TOPIC, 'unknown'), null)
		})

		test('returns the entry fields without userScore when no user given', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.globalScore = 0.6
			await saveEntry(sqlite, TOPIC, entry)

			const data = await getEntryData(sqlite, TOPIC, entry.id)

			assert.equal(data.id, entry.id)
			assert.equal(data.name, 'A')
			assert.equal(data.image, 'assets/unknown.svg')
			assert.equal(data.globalScore, 0.6)
			assert.deepEqual(data.tags, [])
			assert.equal('userScore' in data, false)
		})

		test('includes resolved tags ({id, label}) once tags are added to the entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)

			assert.equal(await addTagToEntry(sqlite, TOPIC, entry.id, animal.id), 'ok')
			const data = await getEntryData(sqlite, TOPIC, entry.id)

			assert.deepEqual(data.tags, [{id: animal.id, label: 'Animal'}])
		})

		test('includes userScore when the given user has a score on this entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const user = await makeUser('bobby')
			user.entries[entry.id] = 0.42

			const data = await getEntryData(sqlite, TOPIC, entry.id, user)

			assert.equal(data.userScore, 0.42)
		})

		test('omits userScore when the given user has no score on this entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const user = await makeUser('bobby')

			const data = await getEntryData(sqlite, TOPIC, entry.id, user)

			assert.equal('userScore' in data, false)
		})

		test('isAdmin is false when no user is given', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			assert.equal((await getEntryData(sqlite, TOPIC, entry.id)).isAdmin, false)
		})

		test('isAdmin is false for a regular authenticated user', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const user = await makeUser('bobby')
			assert.equal((await getEntryData(sqlite, TOPIC, entry.id, user)).isAdmin, false)
		})

		test('isAdmin is true when the given user has the Admin flag set, even without a score on this entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const user = await makeUser('bobby')
			user.isAdmin = true

			const data = await getEntryData(sqlite, TOPIC, entry.id, user)

			assert.equal(data.isAdmin, true)
			assert.equal('userScore' in data, false)
		})
	})

	describe('renameEntry', () => {
		test('returns not_found for an unknown entry', async () => {
			assert.equal(await renameEntry(sqlite, TOPIC, 'unknown', 'New name'), 'not_found')
		})

		test('returns invalid for an empty name', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			assert.equal(await renameEntry(sqlite, TOPIC, entry.id, '   '), 'invalid')
			assert.equal((await getEntryById(sqlite, TOPIC, entry.id)).name, 'A')
		})

		test('returns conflict when another entry already has this name (case-insensitive), without applying it', async () => {
			await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)

			assert.equal(await renameEntry(sqlite, TOPIC, b.id, 'a'), 'conflict')
			assert.equal((await getEntryById(sqlite, TOPIC, b.id)).name, 'B')
		})

		test('renames and persists when there is no conflict', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)

			assert.equal(await renameEntry(sqlite, TOPIC, entry.id, 'Renamed'), 'ok')
			assert.equal((await getEntryById(sqlite, TOPIC, entry.id)).name, 'Renamed')
		})
	})

	describe('listEntries', () => {
		test('without q, sorts by score desc by default and paginates', async () => {
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			a.globalScore = 0.3; await saveEntry(sqlite, TOPIC, a)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			b.globalScore = 0.9; await saveEntry(sqlite, TOPIC, b)
			const c = await getEntryByName(sqlite, TOPIC, 'C', true)
			c.globalScore = 0.6; await saveEntry(sqlite, TOPIC, c)

			const result = await listEntries(sqlite, TOPIC, {page: 1, limit: 2})

			assert.deepEqual(result.items.map((e) => e.id), [b.id, c.id])
			assert.equal(result.total, 3)
			assert.equal(result.hasMore, true)
		})

		test('sort=label sorts alphabetically ascending by default', async () => {
			await getEntryByName(sqlite, TOPIC, 'Zebra', true)
			await getEntryByName(sqlite, TOPIC, 'Apple', true)

			const result = await listEntries(sqlite, TOPIC, {sort: 'label', page: 1, limit: 10})

			assert.deepEqual(result.items.map((e) => e.label), ['Apple', 'Zebra'])
		})

		test('with q, delegates to searchEntry (already capped at 32 by relevance) then paginates', async () => {
			const naruto = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			await getEntryByName(sqlite, TOPIC, 'One Piece', true)

			const result = await listEntries(sqlite, TOPIC, {q: 'naruto', page: 1, limit: 10})

			assert.deepEqual(result.items.map((e) => e.id), [naruto.id])
			assert.equal(result.total, 1)
		})

		test('page beyond total returns an empty items array with coherent metadata', async () => {
			await getEntryByName(sqlite, TOPIC, 'A', true)

			const result = await listEntries(sqlite, TOPIC, {page: 5, limit: 10})

			assert.deepEqual(result.items, [])
			assert.equal(result.total, 1)
			assert.equal(result.hasMore, false)
		})
	})

	describe('updateEntryImage', () => {
		test('returns not_found for an unknown entry', async () => {
			const buffer = await makePngBuffer(10, 10)
			assert.equal(await updateEntryImage(sqlite, TOPIC, 'unknown', buffer), 'not_found')
		})

		test('returns invalid for an unreadable buffer', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			assert.equal(await updateEntryImage(sqlite, TOPIC, entry.id, Buffer.from('not an image')), 'invalid')
			assert.equal((await getEntryById(sqlite, TOPIC, entry.id)).image, 'assets/unknown.svg')
		})

		test('stores the converted image under a per-prefix subdirectory and updates entry.image', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const buffer = await makePngBuffer(10, 10)

			assert.equal(await updateEntryImage(sqlite, TOPIC, entry.id, buffer), 'ok')
			const reloaded = await getEntryById(sqlite, TOPIC, entry.id)
			assert.equal(reloaded.image, '/entryImages/' + entry.id.replace(':', '/') + '.png')
			assert.ok(existsSync(IMAGES_DIR + '/' + entry.id.replace(':', '/') + '.png'))
		})
	})

	describe('deleteEntry', () => {
		test('returns not_found for an unknown entry', async () => {
			const alice = await makeUser('alice')
			assert.equal(await deleteEntry(sqlite, TOPIC, 'unknown', alice), 'not_found')
		})

		test(
			'removes only the calling user\'s votes and score, keeping the entry alive '
			+ 'when another user still references it',
			async () => {
				const entry = await getEntryByName(sqlite, TOPIC, 'A', true)

				const alice = await makeUser('alice')
				alice.quiz.push(new DirectQuiz(entry, 1))
				await saveUser(sqlite, TOPIC, alice)
				const bob = await makeUser('bobby2')
				bob.quiz.push(new DirectQuiz(entry, 0.3))
				await saveUser(sqlite, TOPIC, bob)

				assert.equal(await deleteEntry(sqlite, TOPIC, entry.id, alice), 'ok')

				assert.ok(await getEntryById(sqlite, TOPIC, entry.id), 'entry should still exist: bob still has a vote on it')
				const reloadedBobby2 = await getUser(sqlite, TOPIC, 'bobby2')
				assert.equal(reloadedBobby2.quiz.length, 1)
				const reloadedAlice = await getUser(sqlite, TOPIC, 'alice')
				assert.equal(reloadedAlice.quiz.length, 0)
			})

		test('permanently deletes the entry once no user has a vote left on it', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)

			const alice = await makeUser('alice')
			alice.quiz.push(new DirectQuiz(entry, 1))
			await saveUser(sqlite, TOPIC, alice)

			assert.equal(await deleteEntry(sqlite, TOPIC, entry.id, alice), 'ok')

			assert.equal(await getEntryById(sqlite, TOPIC, entry.id), null)
		})

		test('a dual vote (either as neg or pos) also counts as still referencing the entry', async () => {
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)

			const alice = await makeUser('alice')
			alice.quiz.push(new DirectQuiz(a, 1))
			await saveUser(sqlite, TOPIC, alice)
			const bob = await makeUser('bobby2')
			bob.quiz.push(new DualQuiz(a, b, 1))
			await saveUser(sqlite, TOPIC, bob)

			assert.equal(await deleteEntry(sqlite, TOPIC, a.id, alice), 'ok')

			assert.ok(
				await getEntryById(sqlite, TOPIC, a.id), 'entry should still exist: bob\'s dual vote still references it'
			)
		})

		test('also deletes the entry\'s custom image file once the entry itself is deleted', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const buffer = await makePngBuffer(10, 10)
			await updateEntryImage(sqlite, TOPIC, entry.id, buffer)
			const imagePath = IMAGES_DIR + '/' + entry.id.replace(':', '/') + '.png'
			assert.ok(existsSync(imagePath))

			const alice = await makeUser('alice')
			alice.quiz.push(new DirectQuiz(entry, 1))
			await saveUser(sqlite, TOPIC, alice)

			await deleteEntry(sqlite, TOPIC, entry.id, alice)

			assert.equal(existsSync(imagePath), false)
		})

		test('keeps the entry\'s image file when another user still references the entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const buffer = await makePngBuffer(10, 10)
			await updateEntryImage(sqlite, TOPIC, entry.id, buffer)
			const imagePath = IMAGES_DIR + '/' + entry.id.replace(':', '/') + '.png'

			const alice = await makeUser('alice')
			alice.quiz.push(new DirectQuiz(entry, 1))
			await saveUser(sqlite, TOPIC, alice)
			const bob = await makeUser('bobby2')
			bob.quiz.push(new DirectQuiz(entry, 0.3))
			await saveUser(sqlite, TOPIC, bob)

			await deleteEntry(sqlite, TOPIC, entry.id, alice)

			assert.ok(existsSync(imagePath))
		})
	})
})
