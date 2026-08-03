import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync } from 'node:fs'
import CONFIG from '../../../src/server/config/config.js'
import { tryToMigrate } from '../../../src/server/update/migrate.js'
import { openSqlite } from '../../../src/server/data/sqliteDb.js'

// Isolate from the real ./data/nanking.sqlite (and from other test files
// sharing the same CONFIG singleton): migrate.js reads CONFIG.SQLITE_PATH
// lazily on each call, so mutating it here is enough.
CONFIG.SQLITE_PATH = 'test/tmp/migrate-test.sqlite'

describe('tryToMigrate', () => {
	afterEach(() => {
		rmSync(CONFIG.SQLITE_PATH, {force: true})
	})

	test('creates the database file and seeds the default topic when it does not exist yet', async () => {
		assert.equal(existsSync(CONFIG.SQLITE_PATH), false)

		tryToMigrate()

		assert.equal(existsSync(CONFIG.SQLITE_PATH), true)
		const sqlite = await openSqlite(CONFIG.SQLITE_PATH)
		const topics = await sqlite.all('SELECT id, label FROM topics')
		assert.deepEqual(topics.map((t) => ({...t})), [{id: CONFIG.DEFAULT_TOPIC, label: CONFIG.DEFAULT_TOPIC}])
		await sqlite.close()
	})

	test('does nothing (no error, no duplicate topic) when the database already exists', async () => {
		tryToMigrate()

		await assert.doesNotReject(async () => tryToMigrate())

		const sqlite = await openSqlite(CONFIG.SQLITE_PATH)
		const topics = await sqlite.all('SELECT id, label FROM topics')
		assert.deepEqual(topics.map((t) => ({...t})), [{id: CONFIG.DEFAULT_TOPIC, label: CONFIG.DEFAULT_TOPIC}])
		await sqlite.close()
	})

	test('never overwrites a topic already renamed by the user', async () => {
		tryToMigrate()
		const sqlite = await openSqlite(CONFIG.SQLITE_PATH)
		await sqlite.run('UPDATE topics SET label = ? WHERE id = ?', ['Custom label', CONFIG.DEFAULT_TOPIC])
		await sqlite.close()

		tryToMigrate()

		const reopened = await openSqlite(CONFIG.SQLITE_PATH)
		const topics = await reopened.all('SELECT id, label FROM topics')
		assert.deepEqual(topics.map((t) => ({...t})), [{id: CONFIG.DEFAULT_TOPIC, label: 'Custom label'}])
		await reopened.close()
	})
})
