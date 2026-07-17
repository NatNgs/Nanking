import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync, existsSync } from 'fs'
import { Manager } from '../../../src/server/data/db.js'
import ENTRIES from '../../../src/server/data/entries.js'
import { User } from '../../../src/server/data/user.js'

const TEST_DB_PATH = 'test/tmp/user.test.json'

// User depends on the global ENTRIES catalog (singleton, shared by design across
// users). Each test uses a unique entry name to stay isolated.
let uniqueSuffix = 0
function uniqueName(base) {
	uniqueSuffix++
	return `${base}-${uniqueSuffix}`
}

describe('User', () => {
	let db

	beforeEach(() => {
		db = new Manager({})
	})
	afterEach((t) => {
		// Only clean up on success: keep the file around after a failure, for inspection.
		if(t.passed && existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
	})

	test('setEntryScore() creates the entry if missing from the catalog', () => {
		const name = uniqueName('Naruto')
		const user = new User(db, 'bob')
		user.setEntryScore(name, 0.8)
		assert.ok(ENTRIES.getEntryByName(name))
	})

	test('getUserList() returns the manual and computed score (currently identical)', () => {
		const name = uniqueName('Naruto')
		const user = new User(db, 'bob')
		user.setEntryScore(name, 0.8)
		const list = user.getUserList()
		assert.equal(list.length, 1)
		assert.equal(list[0].label, name)
		assert.equal(list[0].man, 0.8)
		assert.equal(list[0].cur, 0.8)
	})

	test('setEntryScore() updates the score if the entry already exists for this user', () => {
		const name = uniqueName('Naruto')
		const user = new User(db, 'bob')
		user.setEntryScore(name, 0.5)
		user.setEntryScore(name, 0.9)
		const list = user.getUserList()
		assert.equal(list.length, 1)
		assert.equal(list[0].man, 0.9)
	})

	test('save() pushes to the shared db object, then a new manager on the same db finds the scores', () => {
		const name = uniqueName('Naruto')
		const user = new User(db, 'bob')
		user.setEntryScore(name, 0.8)
		user.save()

		const reloaded = new User(db, 'bob')
		const list = reloaded.getUserList()
		assert.equal(list.length, 1)
		assert.equal(list[0].man, 0.8)
	})

	test('without save(), nothing is pushed to the shared db object', () => {
		const name = uniqueName('Naruto')
		const user = new User(db, 'bob')
		user.setEntryScore(name, 0.8)

		const reloaded = new User(db, 'bob')
		assert.equal(reloaded.getUserList().length, 0)
	})

	test('db.save() then db.load() on disk round-trips the score', () => {
		const name = uniqueName('Naruto')
		const user = new User(db, 'bob')
		user.setEntryScore(name, 0.8)
		user.save()
		db.save(TEST_DB_PATH)

		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)
		const reloadedUser = new User(reloadedDb, 'bob')
		assert.equal(reloadedUser.getUserList()[0].man, 0.8)
	})

	test('two users have isolated scores on the same entry', () => {
		const name = uniqueName('Naruto')
		const alice = new User(db, 'alice')
		const bob = new User(db, 'bob')
		alice.setEntryScore(name, 0.9)
		bob.setEntryScore(name, 0.2)
		alice.save()
		bob.save()

		const reloadedAlice = new User(db, 'alice')
		const reloadedBob = new User(db, 'bob')
		assert.equal(reloadedAlice.getUserList()[0].man, 0.9)
		assert.equal(reloadedBob.getUserList()[0].man, 0.2)
	})
})
