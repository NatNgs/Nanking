import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { Jimp } from 'jimp'
import CONFIG from '../../../src/server/config/config.js'
import ENTRIES from '../../../src/server/data/entries.js'
import { Entry } from '../../../src/server/data/entries.js'
import { User, ALL_USERS } from '../../../src/server/data/user.js'
import { DefaultValueQuiz, DualQuiz } from '../../../src/server/data/quiz.js'
import { Manager } from '../../../src/server/data/db.js'
import { getEntryData, renameEntry, updateEntryImage, deleteEntry } from '../../../src/server/services/entryService.js'

// Isolate from the real ./data directory (and from other test files sharing the
// same CONFIG singleton) with a directory of this file's own: entryImageService
// (used internally by updateEntryImage/deleteEntry) reads CONFIG.DATA_DIR lazily,
// so mutating it here is enough.
CONFIG.DATA_DIR = 'test/tmp/data-entryService'
const IMAGES_DIR = CONFIG.DATA_DIR + '/entryImages'

function makeUser(username) {
	return new User(new Manager({}), username)
}

async function makePngBuffer(width, height) {
	const image = new Jimp({width, height, color: 0xff0000ff})
	return image.getBuffer('image/png')
}

describe('entryService', () => {
	beforeEach(() => {
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
		for(const key in ALL_USERS) delete ALL_USERS[key]
	})
	afterEach(() => {
		rmSync(IMAGES_DIR, {recursive: true, force: true})
	})

	describe('getEntryData', () => {
		test('returns null for an unknown entry', () => {
			assert.equal(getEntryData('unknown'), null)
		})

		test('returns the entry fields without userScore when no user given', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			ENTRIES.entries[0].globalScore = 0.6

			const data = getEntryData(0)

			assert.equal(data.id, 0)
			assert.equal(data.name, 'A')
			assert.equal(data.image, 'assets/unknown.svg')
			assert.equal(data.globalScore, 0.6)
			assert.equal('userScore' in data, false)
		})

		test('includes userScore when the given user has a score on this entry', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			const user = makeUser('bobby')
			user.entries[0] = 0.42

			const data = getEntryData(0, user)

			assert.equal(data.userScore, 0.42)
		})

		test('omits userScore when the given user has no score on this entry', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			const user = makeUser('bobby')

			const data = getEntryData(0, user)

			assert.equal('userScore' in data, false)
		})
	})

	describe('renameEntry', () => {
		test('returns not_found for an unknown entry', () => {
			assert.equal(renameEntry('unknown', 'New name'), 'not_found')
		})

		test('returns invalid for an empty name', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			assert.equal(renameEntry(0, '   '), 'invalid')
			assert.equal(ENTRIES.entries[0].name, 'A')
		})

		test('returns conflict when another entry already has this name (case-insensitive), without applying it', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			ENTRIES.entries[1] = new Entry(1, 'B')

			assert.equal(renameEntry(1, 'a'), 'conflict')
			assert.equal(ENTRIES.entries[1].name, 'B')
		})

		test('renames and persists when there is no conflict', () => {
			ENTRIES.entries[0] = new Entry(0, 'A')

			assert.equal(renameEntry(0, 'Renamed'), 'ok')
			assert.equal(ENTRIES.entries[0].name, 'Renamed')
		})
	})

	describe('updateEntryImage', () => {
		test('returns not_found for an unknown entry', async () => {
			const buffer = await makePngBuffer(10, 10)
			assert.equal(await updateEntryImage('unknown', buffer), 'not_found')
		})

		test('returns invalid for an unreadable buffer', async () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			assert.equal(await updateEntryImage(0, Buffer.from('not an image')), 'invalid')
			assert.equal(ENTRIES.entries[0].image, 'assets/unknown.svg')
		})

		test('stores the converted image and updates entry.image', async () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			const buffer = await makePngBuffer(10, 10)

			assert.equal(await updateEntryImage(0, buffer), 'ok')
			assert.equal(ENTRIES.entries[0].image, '/entryImages/0.png')
			assert.ok(existsSync(IMAGES_DIR + '/0.png'))
		})
	})

	describe('deleteEntry', () => {
		test('returns not_found for an unknown entry', () => {
			const alice = makeUser('alice')
			assert.equal(deleteEntry('unknown', alice), 'not_found')
		})

		test('removes only the calling user\'s votes and score, keeping the entry alive when another user still references it', () => {
			const entryA = new Entry(0, 'A')
			ENTRIES.entries[0] = entryA

			const alice = makeUser('alice')
			alice.quiz.push(new DefaultValueQuiz(entryA, 1))
			const bob = makeUser('bob')
			bob.quiz.push(new DefaultValueQuiz(entryA, 0.3))
			bob.entries[0] = 0.3
			ALL_USERS.alice = alice
			ALL_USERS.bob = bob

			assert.equal(deleteEntry(0, alice), 'ok')

			assert.equal(alice.quiz.length, 0)
			assert.ok(ENTRIES.getEntryById(0), 'entry should still exist: bob still has a vote on it')
			assert.equal(bob.quiz.length, 1)
		})

		test('permanently deletes the entry once no user has a vote left on it', () => {
			const entryA = new Entry(0, 'A')
			ENTRIES.entries[0] = entryA

			const alice = makeUser('alice')
			alice.quiz.push(new DefaultValueQuiz(entryA, 1))
			ALL_USERS.alice = alice

			assert.equal(deleteEntry(0, alice), 'ok')

			assert.equal(ENTRIES.getEntryById(0), undefined)
		})

		test('a dual vote (either as neg or pos) also counts as still referencing the entry', () => {
			const entryA = new Entry(0, 'A')
			const entryB = new Entry(1, 'B')
			ENTRIES.entries[0] = entryA
			ENTRIES.entries[1] = entryB

			const alice = makeUser('alice')
			alice.quiz.push(new DefaultValueQuiz(entryA, 1))
			const bob = makeUser('bob')
			bob.quiz.push(new DualQuiz(entryA, entryB, 1))
			ALL_USERS.alice = alice
			ALL_USERS.bob = bob

			assert.equal(deleteEntry(0, alice), 'ok')

			assert.ok(ENTRIES.getEntryById(0), 'entry should still exist: bob\'s dual vote still references it')
		})

		test('also deletes the entry\'s custom image file once the entry itself is deleted', async () => {
			ENTRIES.entries[0] = new Entry(0, 'A')
			const buffer = await makePngBuffer(10, 10)
			await updateEntryImage(0, buffer)
			assert.ok(existsSync(IMAGES_DIR + '/0.png'))

			const alice = makeUser('alice')
			alice.quiz.push(new DefaultValueQuiz(ENTRIES.entries[0], 1))
			ALL_USERS.alice = alice

			deleteEntry(0, alice)

			assert.equal(existsSync(IMAGES_DIR + '/0.png'), false)
		})

		test('keeps the entry\'s image file when another user still references the entry', async () => {
			const entryA = new Entry(0, 'A')
			ENTRIES.entries[0] = entryA
			const buffer = await makePngBuffer(10, 10)
			await updateEntryImage(0, buffer)

			const alice = makeUser('alice')
			alice.quiz.push(new DefaultValueQuiz(entryA, 1))
			const bob = makeUser('bob')
			bob.quiz.push(new DefaultValueQuiz(entryA, 0.3))
			ALL_USERS.alice = alice
			ALL_USERS.bob = bob

			deleteEntry(0, alice)

			assert.ok(existsSync(IMAGES_DIR + '/0.png'))
		})
	})
})
