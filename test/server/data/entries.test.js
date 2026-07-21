import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync, existsSync } from 'fs'
import { Manager } from '../../../src/server/data/db.js'
import { EntriesManager, Entry } from '../../../src/server/data/entries.js'

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

	test('getEntryByName creates an entry with an incremental id, prefixed to identify its source (Nanking-created)', () => {
		const entries = new EntriesManager(db)
		const entry = entries.getEntryByName('Naruto', true)
		assert.equal(entry.name, 'Naruto')
		assert.equal(entry.id, 'n:0')
		assert.equal(entry.image, 'assets/unknown.svg')
		assert.deepEqual(entry.tags, [])
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
		entries.getEntryByName('A', true) // id n:0
		entries.getEntryByName('B', true) // id n:1
		entries.getEntryByName('C', true) // id n:2
		delete entries.entries['n:1']
		// 2 entries remain (A, C): the next starting id is n:2 (already taken by C), so n:3
		const entry = entries.getEntryByName('D', true)
		assert.equal(entry.id, 'n:3')
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
		entry.image = '/entryImages/n/0.png'
		entries.save()

		const reloaded = new EntriesManager(db)
		assert.equal(reloaded.getEntryById(entry.id).image, '/entryImages/n/0.png')
	})

	test('save() then reload round-trips the entry\'s tags', () => {
		const entries = new EntriesManager(db)
		const entry = entries.getEntryByName('Naruto', true)
		entry.tags.push('t:0', 't:1')
		entries.save()

		const reloaded = new EntriesManager(db)
		assert.deepEqual(reloaded.getEntryById(entry.id).tags, ['t:0', 't:1'])
	})

	test('loading an entry with no tags field in storage defaults to an empty array (backward compatibility)', () => {
		const db = new Manager({})
		db.set('entries', {'n:0': {name: 'Naruto'}})

		const entries = new EntriesManager(db)
		assert.deepEqual(entries.getEntryById('n:0').tags, [])
	})

	test('loading an entry with a corrupted (non-array) tags field defaults to an empty array', () => {
		const db = new Manager({})
		db.set('entries', {'n:0': {name: 'Naruto', tags: 'not-an-array'}})

		const entries = new EntriesManager(db)
		assert.deepEqual(entries.getEntryById('n:0').tags, [])
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

describe('Entry id format validation', () => {
	test('accepts a source-prefixed id', () => {
		assert.doesNotThrow(() => new Entry('n:0', 'A'))
	})

	test('accepts an id with a longer source prefix and non-numeric suffix', () => {
		assert.doesNotThrow(() => new Entry('mal:12345', 'A'))
	})

	test('rejects an id with no source prefix', () => {
		assert.throws(() => new Entry('0', 'A'))
	})

	test('rejects an id with an empty prefix or suffix', () => {
		assert.throws(() => new Entry(':0', 'A'))
		assert.throws(() => new Entry('n:', 'A'))
	})

	test('rejects an id containing characters outside [a-z0-9_.-]', () => {
		assert.throws(() => new Entry('n:foo bar', 'A'))
		assert.throws(() => new Entry('N:0', 'A'))
	})
})

describe('EntriesManager loading with invalid stored ids', () => {
	test('skips an entry whose id fails validation, and still loads the others', () => {
		const db = new Manager({})
		db.set('entries', {
			'n:0': {name: 'Valid entry'},
			'invalid id': {name: 'Broken entry'},
			'n:1': {name: 'Another valid entry'},
		})

		const entries = new EntriesManager(db)

		assert.equal(Object.keys(entries.entries).length, 2)
		assert.equal(entries.getEntryById('n:0').name, 'Valid entry')
		assert.equal(entries.getEntryById('n:1').name, 'Another valid entry')
		assert.equal(entries.getEntryById('invalid id'), undefined)
	})
})
