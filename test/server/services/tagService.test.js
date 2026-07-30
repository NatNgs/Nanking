import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { getEntryByName, getEntryById, saveEntry } from '../../../src/server/repository/entriesRepository.js'
import {
	getTagData, renameTag, getOrCreateTag, addTagParent, removeTagParent,
	getParentTree, getChildTree, getEntriesForTag, isTagCoveredByEntry,
	addTagToEntry, removeTagFromEntry, resolveEntryTags, searchTags,
} from '../../../src/server/services/tagService.js'
import { getTagByLabel, getTagById } from '../../../src/server/repository/tagsRepository.js'

const TOPIC = 'anime'

describe('tagService', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(async () => {
		sqlite = db.sqlite
		await sqlite.run('INSERT INTO topics (id, label) VALUES (?, ?)', [TOPIC, 'Anime'])
	})

	describe('getTagData', () => {
		test('returns null for an unknown tag', async () => {
			assert.equal(await getTagData(sqlite, TOPIC, 'unknown'), null)
		})

		test('returns the tag fields', async () => {
			const tag = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			const data = await getTagData(sqlite, TOPIC, tag.id)
			assert.equal(data.id, tag.id)
			assert.equal(data.label, 'Animal')
			assert.deepEqual(data.parents, [])
		})
	})

	describe('renameTag', () => {
		test('returns not_found for an unknown tag', async () => {
			assert.equal(await renameTag(sqlite, TOPIC, 'unknown', 'New label'), 'not_found')
		})

		test('returns invalid for an empty label', async () => {
			const tag = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			assert.equal(await renameTag(sqlite, TOPIC, tag.id, '   '), 'invalid')
			assert.equal((await getTagById(sqlite, TOPIC, tag.id)).label, 'Animal')
		})

		test('returns conflict when another tag already has this label (case-insensitive)', async () => {
			await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			const mammal = await getTagByLabel(sqlite, TOPIC, 'Mammal', true)
			assert.equal(await renameTag(sqlite, TOPIC, mammal.id, 'animal'), 'conflict')
			assert.equal((await getTagById(sqlite, TOPIC, mammal.id)).label, 'Mammal')
		})

		test('renames and persists when there is no conflict', async () => {
			const tag = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			assert.equal(await renameTag(sqlite, TOPIC, tag.id, 'Renamed'), 'ok')
			assert.equal((await getTagById(sqlite, TOPIC, tag.id)).label, 'Renamed')
		})
	})

	describe('getOrCreateTag', () => {
		test('creates a new tag when none matches the label', async () => {
			const tag = await getOrCreateTag(sqlite, TOPIC, 'Animal')
			assert.equal(tag.label, 'Animal')
			assert.ok(await getTagById(sqlite, TOPIC, tag.id))
		})

		test('returns the existing tag by exact label (idempotent)', async () => {
			const first = await getOrCreateTag(sqlite, TOPIC, 'Animal')
			const second = await getOrCreateTag(sqlite, TOPIC, 'Animal')
			assert.equal(first.id, second.id)
			const {count} = await sqlite.get('SELECT COUNT(*) as count FROM tags')
			assert.equal(count, 1)
		})
	})

	describe('addTagParent / removeTagParent', () => {
		test('addTagParent delegates to tagsRepository.addParent and persists', async () => {
			const cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			assert.equal(await addTagParent(sqlite, TOPIC, cat.id, animal.id), 'ok')
			assert.deepEqual((await getTagById(sqlite, TOPIC, cat.id)).parents, [animal.id])
		})

		test('addTagParent rejects a cycle', async () => {
			const cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			await addTagParent(sqlite, TOPIC, cat.id, animal.id)
			assert.equal(await addTagParent(sqlite, TOPIC, animal.id, cat.id), 'cycle')
		})

		test('removeTagParent removes the link', async () => {
			const cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			await addTagParent(sqlite, TOPIC, cat.id, animal.id)
			assert.equal(await removeTagParent(sqlite, TOPIC, cat.id, animal.id), 'ok')
			assert.deepEqual((await getTagById(sqlite, TOPIC, cat.id)).parents, [])
		})
	})

	describe('getParentTree / getChildTree', () => {
		let livingBeing, animal, mammal, cat

		beforeEach(async () => {
			livingBeing = await getTagByLabel(sqlite, TOPIC, 'Living being', true)
			animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			mammal = await getTagByLabel(sqlite, TOPIC, 'Mammal', true)
			cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			await addTagParent(sqlite, TOPIC, mammal.id, animal.id) // Mammal -> Animal
			await addTagParent(sqlite, TOPIC, mammal.id, livingBeing.id) // Mammal -> Living being
			await addTagParent(sqlite, TOPIC, cat.id, mammal.id) // Cat -> Mammal
		})

		test('getParentTree returns direct parents with their own direct parents (depth 2)', async () => {
			const tree = await getParentTree(sqlite, TOPIC, mammal.id)
			const ids = tree.map((n) => n.id).sort()
			assert.deepEqual(ids, [animal.id, livingBeing.id].sort())
			for(const node of tree) assert.deepEqual(node.parents, [])
		})

		test('getParentTree on a leaf tag returns an empty array', async () => {
			assert.deepEqual(await getParentTree(sqlite, TOPIC, livingBeing.id), [])
		})

		test('getChildTree returns direct children (derived) with their own direct children', async () => {
			const tree = await getChildTree(sqlite, TOPIC, animal.id)
			assert.equal(tree.length, 1)
			assert.equal(tree[0].id, mammal.id)
			assert.deepEqual(tree[0].children.map((c) => c.id), [cat.id])
		})

		test('getChildTree on a leaf tag returns an empty array', async () => {
			assert.deepEqual(await getChildTree(sqlite, TOPIC, cat.id), [])
		})
	})

	describe('getEntriesForTag', () => {
		let animal, cat

		beforeEach(async () => {
			animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			await addTagParent(sqlite, TOPIC, cat.id, animal.id) // Cat -> Animal
		})

		test('counts an entry tagged directly with the tag', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Direct', true)
			entry.tags.push(animal.id)
			await saveEntry(sqlite, TOPIC, entry)
			const result = await getEntriesForTag(sqlite, TOPIC, animal.id)
			assert.deepEqual(result.map((e) => e.id), [entry.id])
		})

		test('counts an entry tagged with a more specific (descendant) tag, via inheritance', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Cat entry', true)
			entry.tags.push(cat.id)
			await saveEntry(sqlite, TOPIC, entry)
			const result = await getEntriesForTag(sqlite, TOPIC, animal.id)
			assert.deepEqual(result.map((e) => e.id), [entry.id])
		})

		test('does not count an entry tagged only with a more generic (ancestor) tag, wrong direction', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Animal entry', true)
			entry.tags.push(animal.id)
			await saveEntry(sqlite, TOPIC, entry)
			const result = await getEntriesForTag(sqlite, TOPIC, cat.id)
			assert.deepEqual(result, [])
		})

		test('does not list the same entry twice even with multiple relevant tags', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'Both', true)
			entry.tags.push(animal.id, cat.id)
			await saveEntry(sqlite, TOPIC, entry)
			const result = await getEntriesForTag(sqlite, TOPIC, animal.id)
			assert.equal(result.length, 1)
		})
	})

	describe('isTagCoveredByEntry', () => {
		let animal, cat

		beforeEach(async () => {
			animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			await addTagParent(sqlite, TOPIC, cat.id, animal.id) // Cat -> Animal
		})

		test('true when the tag is already directly present', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push(animal.id)
			assert.equal(await isTagCoveredByEntry(sqlite, TOPIC, entry, animal.id), true)
		})

		test('true when a direct tag on the entry is more specific (already inherits the target tag)', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push(cat.id)
			assert.equal(await isTagCoveredByEntry(sqlite, TOPIC, entry, animal.id), true)
		})

		test('false when the entry only has a more generic tag (does not inherit the more specific one)', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push(animal.id)
			assert.equal(await isTagCoveredByEntry(sqlite, TOPIC, entry, cat.id), false)
		})

		test('false when unrelated', async () => {
			const unrelated = await getTagByLabel(sqlite, TOPIC, 'Unrelated', true)
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push(animal.id)
			assert.equal(await isTagCoveredByEntry(sqlite, TOPIC, entry, unrelated.id), false)
		})
	})

	describe('addTagToEntry / removeTagFromEntry', () => {
		test('returns not_found for an unknown entry or tag', async () => {
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			assert.equal(await addTagToEntry(sqlite, TOPIC, 'unknown', animal.id), 'not_found')
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			assert.equal(await addTagToEntry(sqlite, TOPIC, entry.id, 'unknown'), 'not_found')
		})

		test('adds the tag and persists', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			assert.equal(await addTagToEntry(sqlite, TOPIC, entry.id, animal.id), 'ok')
			assert.deepEqual((await getEntryById(sqlite, TOPIC, entry.id)).tags, [animal.id])
		})

		test('returns already_covered when the tag or an ancestor is already present', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			const cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			await addTagParent(sqlite, TOPIC, cat.id, animal.id)
			entry.tags.push(cat.id)
			await saveEntry(sqlite, TOPIC, entry)

			assert.equal(await addTagToEntry(sqlite, TOPIC, entry.id, animal.id), 'already_covered')
		})

		test('removeTagFromEntry removes only the direct link, idempotently', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			entry.tags.push(animal.id)
			await saveEntry(sqlite, TOPIC, entry)

			assert.equal(await removeTagFromEntry(sqlite, TOPIC, entry.id, animal.id), 'ok')
			assert.deepEqual((await getEntryById(sqlite, TOPIC, entry.id)).tags, [])
			assert.equal(await removeTagFromEntry(sqlite, TOPIC, entry.id, animal.id), 'ok')
		})

		test('removeTagFromEntry returns not_found for an unknown entry', async () => {
			assert.equal(await removeTagFromEntry(sqlite, TOPIC, 'unknown', 't:0'), 'not_found')
		})
	})

	describe('resolveEntryTags', () => {
		test('resolves direct tag ids into {id, label} pairs', async () => {
			const animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push(animal.id)
			assert.deepEqual(await resolveEntryTags(sqlite, TOPIC, entry), [{id: animal.id, label: 'Animal'}])
		})

		test('skips a tag id that no longer resolves', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push('t:unknown')
			assert.deepEqual(await resolveEntryTags(sqlite, TOPIC, entry), [])
		})
	})

	describe('searchTags', () => {
		let animal, mammal, cat

		beforeEach(async () => {
			animal = await getTagByLabel(sqlite, TOPIC, 'Animal', true)
			mammal = await getTagByLabel(sqlite, TOPIC, 'Mammal', true)
			cat = await getTagByLabel(sqlite, TOPIC, 'Cat', true)
			await addTagParent(sqlite, TOPIC, mammal.id, animal.id) // Mammal -> Animal
			await addTagParent(sqlite, TOPIC, cat.id, mammal.id) // Cat -> Mammal
		})

		test('with no filter, returns every tag', async () => {
			const result = await searchTags(sqlite, TOPIC, {})
			assert.equal(result.length, 3)
		})

		test('q filters by label substring, like searchTag', async () => {
			const result = await searchTags(sqlite, TOPIC, {q: 'Ma'})
			assert.deepEqual(result.map((t) => t.id).sort(), [animal.id, mammal.id].sort())
		})

		test('q with no substring match returns nothing', async () => {
			const result = await searchTags(sqlite, TOPIC, {q: 'zzz'})
			assert.deepEqual(result, [])
		})

		test('notOnEntity excludes tags already covered on the entry', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push(cat.id) // covers Cat, Mammal, Animal
			await saveEntry(sqlite, TOPIC, entry)
			const result = await searchTags(sqlite, TOPIC, {notOnEntity: entry.id})
			assert.deepEqual(result, [])
		})

		test(
			'notHavingAsChild excludes candidates that would create a cycle '
			+ 'as a parent of the given tag (its descendants)',
			async () => {
				const result = await searchTags(sqlite, TOPIC, {notHavingAsChild: [mammal.id]})
				assert.deepEqual(result.map((t) => t.id), [animal.id])
			})

		test('notHavingAsChild excludes the tag itself too (its own descendant closure includes it)', async () => {
			const result = await searchTags(sqlite, TOPIC, {notHavingAsChild: [animal.id]})
			assert.deepEqual(result, [])
		})

		test(
			'notHavingAsParent excludes candidates that would create a cycle '
			+ 'as a child of the given tag (its ancestors)',
			async () => {
				const result = await searchTags(sqlite, TOPIC, {notHavingAsParent: [mammal.id]})
				assert.deepEqual(result.map((t) => t.id), [cat.id])
			})

		test('combines multiple filters', async () => {
			const entry = await getEntryByName(sqlite, TOPIC, 'A', true)
			entry.tags.push(animal.id)
			await saveEntry(sqlite, TOPIC, entry)
			const result = await searchTags(sqlite, TOPIC, {notOnEntity: entry.id, notHavingAsChild: [mammal.id]})
			assert.deepEqual(result, [])
		})
	})
})
