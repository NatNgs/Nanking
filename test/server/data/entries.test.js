import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync, existsSync } from 'fs'
import { Manager } from '../../../src/server/data/db.js'
import { EntriesManager } from '../../../src/server/data/entries.js'

const TEST_DB_PATH = 'test/tmp/entries.test.json'

describe('EntriesManager', () => {
	let db

	beforeEach(() => {
		db = new Manager({})
	})
	afterEach((t) => {
		// Only clean up on success: keep the file around after a failure, for inspection.
		if(t.passed && existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
	})

	test('getEntryByName returns null when missing and createIfNotExists=false', () => {
		const entries = new EntriesManager(db)
		assert.equal(entries.getEntryByName('Naruto'), null)
	})

	test('getEntryByName creates an entry with an incremental id', () => {
		const entries = new EntriesManager(db)
		const entry = entries.getEntryByName('Naruto', true)
		assert.equal(entry.name, 'Naruto')
		assert.equal(entry.id, 0)
		assert.equal(entry.image, 'assets/unknown.svg')
	})

	test('getEntryByName finds an existing entry by name (no duplicate)', () => {
		const entries = new EntriesManager(db)
		const first = entries.getEntryByName('Naruto', true)
		const second = entries.getEntryByName('Naruto', true)
		assert.equal(first.id, second.id)
		assert.equal(Object.keys(entries.entries).length, 1)
	})

	test('getEntryByName reuses the id based on the remaining entry count if free', () => {
		const entries = new EntriesManager(db)
		entries.getEntryByName('A', true) // id 0
		entries.getEntryByName('B', true) // id 1
		entries.getEntryByName('C', true) // id 2
		delete entries.entries[1]
		// 2 entries remain (A, C): the next starting id is 2 (already taken by C), so 3
		const entry = entries.getEntryByName('D', true)
		assert.equal(entry.id, 3)
	})

	test('getEntryById finds an entry by id', () => {
		const entries = new EntriesManager(db)
		const created = entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryById(created.id), created)
	})

	test('save() pushes to the shared db object, then a new manager on the same db finds the entries', () => {
		const entries = new EntriesManager(db)
		entries.getEntryByName('Naruto', true)
		entries.getEntryByName('One Piece', true)
		entries.save()

		const reloaded = new EntriesManager(db)
		assert.equal(Object.keys(reloaded.entries).length, 2)
		assert.ok(reloaded.getEntryByName('Naruto'))
		assert.ok(reloaded.getEntryByName('One Piece'))
	})

	test('without save(), nothing is pushed to the shared db object', () => {
		const entries = new EntriesManager(db)
		entries.getEntryByName('Naruto', true)

		const reloaded = new EntriesManager(db)
		assert.equal(Object.keys(reloaded.entries).length, 0)
	})

	test('db.save() then db.load() on disk round-trips the entries', () => {
		const entries = new EntriesManager(db)
		entries.getEntryByName('Naruto', true)
		entries.save()
		db.save(TEST_DB_PATH)

		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)
		const reloadedEntries = new EntriesManager(reloadedDb)
		assert.ok(reloadedEntries.getEntryByName('Naruto'))
	})

	test('save() then reload also round-trips a custom image', () => {
		const entries = new EntriesManager(db)
		const entry = entries.getEntryByName('Naruto', true)
		entry.image = '/entryImages/0.png'
		entries.save()

		const reloaded = new EntriesManager(db)
		assert.equal(reloaded.getEntryById(entry.id).image, '/entryImages/0.png')
	})

	test('getEntryByNameIgnoreCase finds an entry regardless of case', () => {
		const entries = new EntriesManager(db)
		const entry = entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryByNameIgnoreCase('NARUTO'), entry)
		assert.equal(entries.getEntryByNameIgnoreCase('naruto'), entry)
	})

	test('getEntryByNameIgnoreCase returns null when no entry matches', () => {
		const entries = new EntriesManager(db)
		entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryByNameIgnoreCase('One Piece'), null)
	})

	test('getEntryByNameIgnoreCase excludes the given entry id (renaming to its own name is not a conflict)', () => {
		const entries = new EntriesManager(db)
		const entry = entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryByNameIgnoreCase('naruto', entry.id), null)
	})

	test('deleteEntry removes the entry so it can no longer be found by id', () => {
		const entries = new EntriesManager(db)
		const entry = entries.getEntryByName('Naruto', true)
		entries.deleteEntry(entry.id)
		assert.equal(entries.getEntryById(entry.id), undefined)
	})
})
