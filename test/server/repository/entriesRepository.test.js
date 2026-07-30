import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { Entry } from '../../../src/server/model/entriesModel.js'
import {
	getEntryByName, getEntryByNameIgnoreCase, searchEntry, getEntryById,
	getEntriesByIds, getAllEntriesWithScores, saveEntry, deleteEntry,
} from '../../../src/server/repository/entriesRepository.js'

const TOPIC = 'anime'

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

describe('entriesRepository', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	describe('getEntryByName', () => {
		test('returns null when missing and createIfNotExists=false', async () => {
			assert.equal(await getEntryByName(sqlite, TOPIC, 'Naruto'), null)
		})

		test('creates an entry with an incremental id, prefixed to identify its source', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			assert.equal(entry.name, 'Naruto')
			assert.equal(entry.id, 'n:0')
			assert.equal(entry.image, 'assets/unknown.svg')
			assert.deepEqual(entry.tags, [])
		})

		test('finds an existing entry by name (no duplicate)', async () => {
			const first = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const second = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			assert.equal(first.id, second.id)
			const {count} = await sqlite.get('SELECT COUNT(*) as count FROM entries')
			assert.equal(count, 1)
		})

		test('reuses the id based on the remaining entry count if free', async () => {
			await getEntryByName(sqlite, TOPIC, 'A', true) // id n:0
			await getEntryByName(sqlite, TOPIC, 'B', true) // id n:1
			const c = await getEntryByName(sqlite, TOPIC, 'C', true) // id n:2
			await deleteEntry(sqlite, TOPIC, (await getEntryByName(sqlite, TOPIC, 'B')).id)
			// 2 entries remain (A, C): the next starting id is n:2 (already taken by C), so n:3
			const entry = await getEntryByName(sqlite, TOPIC, 'D', true)
			assert.equal(entry.id, 'n:3')
			assert.ok(c)
		})

		test('the same name can exist independently in two different topics', async () => {
			await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', ['movies', 'Movies'])
			const anime = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const movie = await getEntryByName(sqlite, 'movies', 'Naruto', true)
			assert.equal(anime.id, movie.id) // both start their own n:0 sequence, independently
			// but a lookup scoped to one topic never sees the other topic's row
			const {count} = await sqlite.get('SELECT COUNT(*) as count FROM entries WHERE name = ?', ['Naruto'])
			assert.equal(count, 2)
		})
	})

	describe('getEntryById / getEntriesByIds', () => {
		test('getEntryById finds an entry by id', async () => {
			const created = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const found = await getEntryById(sqlite, TOPIC, created.id)
			assert.equal(found.id, created.id)
			assert.equal(found.name, 'Naruto')
		})

		test('getEntryById returns null for an unknown id', async () => {
			assert.equal(await getEntryById(sqlite, TOPIC, 'n:unknown'), null)
		})

		test('getEntryById populates tags[] from entry_tags', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			await sqlite.run("INSERT INTO tags (topic_id, id, label) VALUES (?, 't:0', 'Anime')", [TOPIC])
			await sqlite.run(
				'INSERT INTO entry_tags (topic_id, entry_id, tag_id) VALUES (?, ?, ?)', [TOPIC, entry.id, 't:0']
			)
			const found = await getEntryById(sqlite, TOPIC, entry.id)
			assert.deepEqual(found.tags, ['t:0'])
		})

		test('getEntriesByIds batches multiple lookups, ignoring unknown ids', async () => {
			const a = await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			const map = await getEntriesByIds(sqlite, TOPIC, [a.id, b.id, 'n:unknown'])
			assert.equal(map.size, 2)
			assert.equal(map.get(a.id).name, 'A')
			assert.equal(map.get(b.id).name, 'B')
		})

		test('getEntriesByIds returns an empty Map for an empty input', async () => {
			const map = await getEntriesByIds(sqlite, TOPIC, [])
			assert.equal(map.size, 0)
		})
	})

	describe('getEntryByNameIgnoreCase', () => {
		test('finds an entry regardless of case', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const upper = await getEntryByNameIgnoreCase(sqlite, TOPIC, 'NARUTO')
			const lower = await getEntryByNameIgnoreCase(sqlite, TOPIC, 'naruto')
			assert.equal(upper.id, entry.id)
			assert.equal(lower.id, entry.id)
		})

		test('returns null when no entry matches', async () => {
			await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			assert.equal(await getEntryByNameIgnoreCase(sqlite, TOPIC, 'One Piece'), null)
		})

		test('excludes the given entry id (renaming to its own name is not a conflict)', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			assert.equal(await getEntryByNameIgnoreCase(sqlite, TOPIC, 'naruto', entry.id), null)
		})
	})

	describe('searchEntry', () => {
		test('matches a substring, sorted by name length (shortest first)', async () => {
			await getEntryByName(sqlite, TOPIC, 'Naruto Shippuden', true)
			await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			const results = await searchEntry(sqlite, TOPIC, 'Naruto')
			assert.equal(results.length, 2)
			assert.equal(results[0].name, 'Naruto')
			assert.equal(results[1].name, 'Naruto Shippuden')
		})

		test('supports the * wildcard convention', async () => {
			await getEntryByName(sqlite, TOPIC, 'One Piece', true)
			await getEntryByName(sqlite, TOPIC, 'One Punch Man', true)
			const results = await searchEntry(sqlite, TOPIC, 'One*Man')
			assert.equal(results.length, 1)
			assert.equal(results[0].name, 'One Punch Man')
		})

		test('caps results to 32', async () => {
			for(let i = 0; i < 40; i++) await getEntryByName(sqlite, TOPIC, 'Entry ' + i, true)
			const results = await searchEntry(sqlite, TOPIC, 'Entry')
			assert.equal(results.length, 32)
		})
	})

	describe('saveEntry', () => {
		test('upserts name/image/globalScore and resyncs tags', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			entry.name = 'Naruto Renamed'
			entry.image = 'custom.png'
			entry.globalScore = 0.75
			entry.tags = ['t:0']
			await sqlite.run("INSERT INTO tags (topic_id, id, label) VALUES (?, 't:0', 'Anime')", [TOPIC])

			await saveEntry(sqlite, TOPIC, entry)

			const reloaded = await getEntryById(sqlite, TOPIC, entry.id)
			assert.equal(reloaded.name, 'Naruto Renamed')
			assert.equal(reloaded.image, 'custom.png')
			assert.equal(reloaded.globalScore, 0.75)
			assert.deepEqual(reloaded.tags, ['t:0'])
		})

		test('resync removes tags no longer present on the entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			await sqlite.run("INSERT INTO tags (topic_id, id, label) VALUES (?, 't:0', 'Anime')", [TOPIC])
			entry.tags = ['t:0']
			await saveEntry(sqlite, TOPIC, entry)

			entry.tags = []
			await saveEntry(sqlite, TOPIC, entry)

			const reloaded = await getEntryById(sqlite, TOPIC, entry.id)
			assert.deepEqual(reloaded.tags, [])
		})
	})

	describe('deleteEntry', () => {
		test('removes the entry so it can no longer be found by id', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			await deleteEntry(sqlite, TOPIC, entry.id)
			assert.equal(await getEntryById(sqlite, TOPIC, entry.id), null)
		})

		test('removes its entry_tags rows too', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Naruto', true)
			await sqlite.run("INSERT INTO tags (topic_id, id, label) VALUES (?, 't:0', 'Anime')", [TOPIC])
			await sqlite.run(
				'INSERT INTO entry_tags (topic_id, entry_id, tag_id) VALUES (?, ?, ?)', [TOPIC, entry.id, 't:0']
			)
			await deleteEntry(sqlite, TOPIC, entry.id)
			const rows = await sqlite.all('SELECT * FROM entry_tags WHERE topic_id = ? AND entry_id = ?', [TOPIC, entry.id])
			assert.equal(rows.length, 0)
		})
	})

	describe('getAllEntriesWithScores', () => {
		test('returns every entry with its current global_score', async () => {
			await getEntryByName(sqlite, TOPIC, 'A', true)
			const b = await getEntryByName(sqlite, TOPIC, 'B', true)
			b.globalScore = 0.9
			await saveEntry(sqlite, TOPIC, b)

			const all = await getAllEntriesWithScores(sqlite, TOPIC)
			assert.equal(all.length, 2)
			const found = all.find((e) => e.id === b.id)
			assert.equal(found.globalScore, 0.9)
		})

		test('never returns entries from another topic', async () => {
			await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', ['movies', 'Movies'])
			await getEntryByName(sqlite, TOPIC, 'Anime Entry', true)
			await getEntryByName(sqlite, 'movies', 'Movie Entry', true)

			const all = await getAllEntriesWithScores(sqlite, TOPIC)
			assert.equal(all.length, 1)
			assert.equal(all[0].name, 'Anime Entry')
		})
	})
})
