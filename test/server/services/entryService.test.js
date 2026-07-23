import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import { Jimp } from 'jimp'
import CONFIG from '../../../src/server/config/config.js'
import ENTRIES from '../../../src/server/data/entries.js'
import { Entry } from '../../../src/server/data/entries.js'
import { User, ALL_USERS } from '../../../src/server/data/user.js'
import { DirectQuiz, DualQuiz } from '../../../src/server/data/quiz.js'
import { getEntryData, renameEntry, updateEntryImage, deleteEntry, listEntries } from '../../../src/server/services/entryService.js'
import TAGS from '../../../src/server/data/tags.js'
import { Tag } from '../../../src/server/data/tags.js'
import { addTagToEntry } from '../../../src/server/services/tagService.js'

// Isolate from the real ./data directory (and from other test files sharing the
// same CONFIG singleton) with a directory of this file's own: entryImageService
// (used internally by updateEntryImage/deleteEntry) reads CONFIG.DATA_DIR lazily,
// so mutating it here is enough.
CONFIG.DATA_DIR = 'test/tmp/data-entryService'
const IMAGES_DIR = CONFIG.DATA_DIR + '/entryImages'

// renameEntry()/deleteEntry() call saveEntries() fire-and-forget internally
// (see entryService.js -> persistenceService.js), which writes to the shared
// SQLITE singleton (test/tmp/nanking.test.sqlite - see conf/conf.test.yml).
// These tests only assert on the in-memory ENTRIES/ALL_USERS state, never on
// that write, so the shared connection is fine to leave un-awaited here.
function makeUser(username) {
	return new User(username)
}

async function makePngBuffer(width, height) {
	const image = new Jimp({width, height, color: 0xff0000ff})
	return image.getBuffer('image/png')
}

describe('entryService', () => {
	beforeEach(() => {
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
		for(const key in ALL_USERS) delete ALL_USERS[key]
		for(const key in TAGS.tags) delete TAGS.tags[key]
	})
	afterEach(() => {
		rmSync(IMAGES_DIR, {recursive: true, force: true})
	})

	describe('getEntryData', () => {
		test('returns null for an unknown entry', () => {
			assert.equal(getEntryData('unknown'), null)
		})

		test('returns the entry fields without userScore when no user given', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].globalScore = 0.6

			const data = getEntryData('n:0')

			assert.equal(data.id, 'n:0')
			assert.equal(data.name, 'A')
			assert.equal(data.image, 'assets/unknown.svg')
			assert.equal(data.globalScore, 0.6)
			assert.deepEqual(data.tags, [])
			assert.equal('userScore' in data, false)
		})

		test('includes resolved tags ({id, label}) once tags are added to the entry', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')

			assert.equal(addTagToEntry('n:0', 't:0'), 'ok')
			const data = getEntryData('n:0')

			assert.deepEqual(data.tags, [{id: 't:0', label: 'Animal'}])
		})

		test('includes userScore when the given user has a score on this entry', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby')
			user.entries['n:0'] = 0.42

			const data = getEntryData('n:0', user)

			assert.equal(data.userScore, 0.42)
		})

		test('omits userScore when the given user has no score on this entry', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const user = makeUser('bobby')

			const data = getEntryData('n:0', user)

			assert.equal('userScore' in data, false)
		})
	})

	describe('renameEntry', () => {
		test('returns not_found for an unknown entry', () => {
			assert.equal(renameEntry('unknown', 'New name'), 'not_found')
		})

		test('returns invalid for an empty name', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			assert.equal(renameEntry('n:0', '   '), 'invalid')
			assert.equal(ENTRIES.entries['n:0'].name, 'A')
		})

		test('returns conflict when another entry already has this name (case-insensitive), without applying it', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')

			assert.equal(renameEntry('n:1', 'a'), 'conflict')
			assert.equal(ENTRIES.entries['n:1'].name, 'B')
		})

		test('renames and persists when there is no conflict', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')

			assert.equal(renameEntry('n:0', 'Renamed'), 'ok')
			assert.equal(ENTRIES.entries['n:0'].name, 'Renamed')
		})
	})

	describe('listEntries', () => {
		test('without q, sorts by score desc by default and paginates', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].globalScore = 0.3
			ENTRIES.entries['n:1'] = new Entry('n:1', 'B')
			ENTRIES.entries['n:1'].globalScore = 0.9
			ENTRIES.entries['n:2'] = new Entry('n:2', 'C')
			ENTRIES.entries['n:2'].globalScore = 0.6

			const result = listEntries({page: 1, limit: 2})

			assert.deepEqual(result.items.map((e) => e.id), ['n:1', 'n:2'])
			assert.equal(result.total, 3)
			assert.equal(result.hasMore, true)
		})

		test('sort=label sorts alphabetically ascending by default', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Zebra')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'Apple')

			const result = listEntries({sort: 'label', page: 1, limit: 10})

			assert.deepEqual(result.items.map((e) => e.label), ['Apple', 'Zebra'])
		})

		test('with q, delegates to ENTRIES.searchEntry (already capped at 32 by relevance) then paginates', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Naruto')
			ENTRIES.entries['n:1'] = new Entry('n:1', 'One Piece')

			const result = listEntries({q: 'naruto', page: 1, limit: 10})

			assert.deepEqual(result.items.map((e) => e.id), ['n:0'])
			assert.equal(result.total, 1)
		})

		test('page beyond total returns an empty items array with coherent metadata', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')

			const result = listEntries({page: 5, limit: 10})

			assert.deepEqual(result.items, [])
			assert.equal(result.total, 1)
			assert.equal(result.hasMore, false)
		})
	})

	describe('updateEntryImage', () => {
		test('returns not_found for an unknown entry', async () => {
			const buffer = await makePngBuffer(10, 10)
			assert.equal(await updateEntryImage('unknown', buffer), 'not_found')
		})

		test('returns invalid for an unreadable buffer', async () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			assert.equal(await updateEntryImage('n:0', Buffer.from('not an image')), 'invalid')
			assert.equal(ENTRIES.entries['n:0'].image, 'assets/unknown.svg')
		})

		test('stores the converted image under a per-prefix subdirectory and updates entry.image', async () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const buffer = await makePngBuffer(10, 10)

			assert.equal(await updateEntryImage('n:0', buffer), 'ok')
			assert.equal(ENTRIES.entries['n:0'].image, '/entryImages/n/0.png')
			assert.ok(existsSync(IMAGES_DIR + '/n/0.png'))
		})
	})

	describe('deleteEntry', () => {
		test('returns not_found for an unknown entry', () => {
			const alice = makeUser('alice')
			assert.equal(deleteEntry('unknown', alice), 'not_found')
		})

		test('removes only the calling user\'s votes and score, keeping the entry alive when another user still references it', () => {
			const entryA = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'] = entryA

			const alice = makeUser('alice')
			alice.quiz.push(new DirectQuiz(entryA, 1))
			const bob = makeUser('bob')
			bob.quiz.push(new DirectQuiz(entryA, 0.3))
			bob.entries['n:0'] = 0.3
			ALL_USERS.alice = alice
			ALL_USERS.bob = bob

			assert.equal(deleteEntry('n:0', alice), 'ok')

			assert.equal(alice.quiz.length, 0)
			assert.ok(ENTRIES.getEntryById('n:0'), 'entry should still exist: bob still has a vote on it')
			assert.equal(bob.quiz.length, 1)
		})

		test('permanently deletes the entry once no user has a vote left on it', () => {
			const entryA = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'] = entryA

			const alice = makeUser('alice')
			alice.quiz.push(new DirectQuiz(entryA, 1))
			ALL_USERS.alice = alice

			assert.equal(deleteEntry('n:0', alice), 'ok')

			assert.equal(ENTRIES.getEntryById('n:0'), undefined)
		})

		test('a dual vote (either as neg or pos) also counts as still referencing the entry', () => {
			const entryA = new Entry('n:0', 'A')
			const entryB = new Entry('n:1', 'B')
			ENTRIES.entries['n:0'] = entryA
			ENTRIES.entries['n:1'] = entryB

			const alice = makeUser('alice')
			alice.quiz.push(new DirectQuiz(entryA, 1))
			const bob = makeUser('bob')
			bob.quiz.push(new DualQuiz(entryA, entryB, 1))
			ALL_USERS.alice = alice
			ALL_USERS.bob = bob

			assert.equal(deleteEntry('n:0', alice), 'ok')

			assert.ok(ENTRIES.getEntryById('n:0'), 'entry should still exist: bob\'s dual vote still references it')
		})

		test('also deletes the entry\'s custom image file once the entry itself is deleted', async () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			const buffer = await makePngBuffer(10, 10)
			await updateEntryImage('n:0', buffer)
			assert.ok(existsSync(IMAGES_DIR + '/n/0.png'))

			const alice = makeUser('alice')
			alice.quiz.push(new DirectQuiz(ENTRIES.entries['n:0'], 1))
			ALL_USERS.alice = alice

			deleteEntry('n:0', alice)

			assert.equal(existsSync(IMAGES_DIR + '/n/0.png'), false)
		})

		test('keeps the entry\'s image file when another user still references the entry', async () => {
			const entryA = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'] = entryA
			const buffer = await makePngBuffer(10, 10)
			await updateEntryImage('n:0', buffer)

			const alice = makeUser('alice')
			alice.quiz.push(new DirectQuiz(entryA, 1))
			const bob = makeUser('bob')
			bob.quiz.push(new DirectQuiz(entryA, 0.3))
			ALL_USERS.alice = alice
			ALL_USERS.bob = bob

			deleteEntry('n:0', alice)

			assert.ok(existsSync(IMAGES_DIR + '/n/0.png'))
		})
	})
})
