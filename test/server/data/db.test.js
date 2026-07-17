import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync, existsSync } from 'fs'
import { Manager } from '../../../src/server/data/db.js'

const TEST_DB_PATH = 'test/tmp/db.test.json'

describe('Manager', () => {
	afterEach((t) => {
		// Only clean up on success: keep the file around after a failure, for inspection.
		if(t.passed && existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
	})

	test('load() on a missing file leaves the db empty, without throwing', () => {
		const db = new Manager({})
		db.load(TEST_DB_PATH)
		assert.deepEqual(db.get(null), {})
	})

	test('starting from an empty db, writing data, saving to disk, then reloading in a fresh manager restores the data', () => {
		const db = new Manager({})
		db.load(TEST_DB_PATH) // no file yet: starts empty

		// A few changes across different namespaces, mirroring how the data managers use sub()
		const accounts = db.sub('p#')
		accounts.set('bobby', {hash: 'abc', salt: 'xyz'})

		const entries = db.sub('entries')
		entries.set('0', {name: 'Naruto'})
		entries.set('1', {name: 'One Piece'})

		const userEntries = db.sub('users.bobby.entries')
		userEntries.set('0', 0.8)

		db.save(TEST_DB_PATH)

		// Fresh manager, fresh in-memory object: only the file on disk can restore the data
		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)

		assert.deepEqual(reloadedDb.get('p#.bobby'), {hash: 'abc', salt: 'xyz'})
		assert.deepEqual(reloadedDb.get('entries.0'), {name: 'Naruto'})
		assert.deepEqual(reloadedDb.get('entries.1'), {name: 'One Piece'})
		assert.equal(reloadedDb.get('users.bobby.entries.0'), 0.8)

		// Sub-managers built on the reloaded manager behave the same as before saving
		assert.deepEqual(reloadedDb.sub('p#').keys(), ['bobby'])
		assert.ok(reloadedDb.sub('p#').has('bobby'))
	})

	test('reloading does not keep stale in-memory data that was never saved', () => {
		const db = new Manager({})
		db.load(TEST_DB_PATH)
		db.sub('p#').set('bobby', {hash: 'abc', salt: 'xyz'})
		db.save(TEST_DB_PATH)

		// New unsaved change on the same manager
		db.sub('p#').set('alice', {hash: 'def', salt: 'uvw'})

		// Reload from disk into a fresh manager: only the saved data should be there
		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)
		assert.ok(reloadedDb.sub('p#').has('bobby'))
		assert.equal(reloadedDb.sub('p#').has('alice'), false)
	})
})
