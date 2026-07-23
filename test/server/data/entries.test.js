import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EntriesManager, Entry } from '../../../src/server/data/entries.js'

describe('EntriesManager', () => {
	test('getEntryByName returns null when missing and createIfNotExists=false', () => {
		const entries = new EntriesManager()
		assert.equal(entries.getEntryByName('Naruto'), null)
	})

	test('getEntryByName creates an entry with an incremental id, prefixed to identify its source (Nanking-created)', () => {
		const entries = new EntriesManager()
		const entry = entries.getEntryByName('Naruto', true)
		assert.equal(entry.name, 'Naruto')
		assert.equal(entry.id, 'n:0')
		assert.equal(entry.image, 'assets/unknown.svg')
		assert.deepEqual(entry.tags, [])
	})

	test('getEntryByName finds an existing entry by name (no duplicate)', () => {
		const entries = new EntriesManager()
		const first = entries.getEntryByName('Naruto', true)
		const second = entries.getEntryByName('Naruto', true)
		assert.equal(first.id, second.id)
		assert.equal(Object.keys(entries.entries).length, 1)
	})

	test('getEntryByName reuses the id based on the remaining entry count if free', () => {
		const entries = new EntriesManager()
		entries.getEntryByName('A', true) // id n:0
		entries.getEntryByName('B', true) // id n:1
		entries.getEntryByName('C', true) // id n:2
		delete entries.entries['n:1']
		// 2 entries remain (A, C): the next starting id is n:2 (already taken by C), so n:3
		const entry = entries.getEntryByName('D', true)
		assert.equal(entry.id, 'n:3')
	})

	test('getEntryById finds an entry by id', () => {
		const entries = new EntriesManager()
		const created = entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryById(created.id), created)
	})

	test('getEntryByNameIgnoreCase finds an entry regardless of case', () => {
		const entries = new EntriesManager()
		const entry = entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryByNameIgnoreCase('NARUTO'), entry)
		assert.equal(entries.getEntryByNameIgnoreCase('naruto'), entry)
	})

	test('getEntryByNameIgnoreCase returns null when no entry matches', () => {
		const entries = new EntriesManager()
		entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryByNameIgnoreCase('One Piece'), null)
	})

	test('getEntryByNameIgnoreCase excludes the given entry id (renaming to its own name is not a conflict)', () => {
		const entries = new EntriesManager()
		const entry = entries.getEntryByName('Naruto', true)
		assert.equal(entries.getEntryByNameIgnoreCase('naruto', entry.id), null)
	})

	test('deleteEntry removes the entry so it can no longer be found by id', () => {
		const entries = new EntriesManager()
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
