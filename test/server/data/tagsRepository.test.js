import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import { Tag } from '../../../src/server/data/tagsModel.js'
import {
	getTagByLabel, getTagByLabelIgnoreCase, searchTag, getTagById, getTagsByIds,
	getAncestorIds, getDescendantIds, getDirectChildren, wouldCreateCycle,
	addParent, removeParent, pruneOrphanTagIds, saveTag, deleteTag,
} from '../../../src/server/data/tagsRepository.js'
import { getEntryByName, saveEntry } from '../../../src/server/data/entriesRepository.js'

describe('Tag id format validation', () => {
	test('accepts a "t:" prefixed id', () => {
		assert.doesNotThrow(() => new Tag('t:0', 'Animal'))
	})

	test('rejects an id with no "t:" prefix', () => {
		assert.throws(() => new Tag('0', 'Animal'))
		assert.throws(() => new Tag('n:0', 'Animal'))
	})

	test('rejects an id with an empty suffix', () => {
		assert.throws(() => new Tag('t:', 'Animal'))
	})

	test('rejects an id containing characters outside [a-z0-9_.-]', () => {
		assert.throws(() => new Tag('t:foo bar', 'Animal'))
		assert.throws(() => new Tag('T:0', 'Animal'))
	})
})

describe('tagsRepository', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(() => { sqlite = db.sqlite })

	describe('getTagByLabel', () => {
		test('returns null when missing and createIfNotExists=false', async () => {
			assert.equal(await getTagByLabel(sqlite, 'Animal'), null)
		})

		test('creates a tag with an incremental id', async () => {
			const tag = await getTagByLabel(sqlite, 'Animal', true)
			assert.equal(tag.label, 'Animal')
			assert.equal(tag.id, 't:0')
			assert.deepEqual(tag.parents, [])
		})

		test('finds an existing tag by label (no duplicate)', async () => {
			const first = await getTagByLabel(sqlite, 'Animal', true)
			const second = await getTagByLabel(sqlite, 'Animal', true)
			assert.equal(first.id, second.id)
			const {count} = await sqlite.get('SELECT COUNT(*) as count FROM tags')
			assert.equal(count, 1)
		})
	})

	describe('getTagById / getTagsByIds', () => {
		test('getTagById finds a tag by id', async () => {
			const created = await getTagByLabel(sqlite, 'Animal', true)
			const found = await getTagById(sqlite, created.id)
			assert.equal(found.id, created.id)
		})

		test('getTagById returns null for an unknown id', async () => {
			assert.equal(await getTagById(sqlite, 't:unknown'), null)
		})

		test('getTagsByIds batches lookups, ignoring unknown ids', async () => {
			const a = await getTagByLabel(sqlite, 'A', true)
			const b = await getTagByLabel(sqlite, 'B', true)
			const map = await getTagsByIds(sqlite, [a.id, b.id, 't:unknown'])
			assert.equal(map.size, 2)
		})
	})

	describe('getTagByLabelIgnoreCase', () => {
		test('finds a tag regardless of case, excluding a given id', async () => {
			const tag = await getTagByLabel(sqlite, 'Animal', true)
			const found = await getTagByLabelIgnoreCase(sqlite, 'ANIMAL')
			assert.equal(found.id, tag.id)
			assert.equal(await getTagByLabelIgnoreCase(sqlite, 'animal', tag.id), null)
		})
	})

	describe('searchTag', () => {
		test('matches a substring, sorted by label length', async () => {
			await getTagByLabel(sqlite, 'Animal Kingdom', true)
			await getTagByLabel(sqlite, 'Animal', true)
			const results = await searchTag(sqlite, 'Animal')
			assert.equal(results.length, 2)
			assert.equal(results[0].label, 'Animal')
		})
	})

	describe('pruneOrphanTagIds', () => {
		test('lists a tag with no relation at all', async () => {
			const orphan = await getTagByLabel(sqlite, 'Orphan', true)
			const animal = await getTagByLabel(sqlite, 'Animal', true)
			const cat = await getTagByLabel(sqlite, 'Cat', true)
			await addParent(sqlite, cat.id, animal.id)

			assert.deepEqual(await pruneOrphanTagIds(sqlite), [orphan.id])
		})

		test('keeps a tag with no parent/child but linked to an entry', async () => {
			const linked = await getTagByLabel(sqlite, 'Linked', true)
			const entry = await getEntryByName(sqlite, 'Some entry', true)
			entry.tags.push(linked.id)
			await saveEntry(sqlite, entry)

			assert.deepEqual(await pruneOrphanTagIds(sqlite), [])
		})
	})

	describe('saveTag / deleteTag', () => {
		test('saveTag upserts label and resyncs parents', async () => {
			const animal = await getTagByLabel(sqlite, 'Animal', true)
			const cat = await getTagByLabel(sqlite, 'Cat', true)
			cat.label = 'Cat Renamed'
			cat.parents = [animal.id]
			await saveTag(sqlite, cat)

			const reloaded = await getTagById(sqlite, cat.id)
			assert.equal(reloaded.label, 'Cat Renamed')
			assert.deepEqual(reloaded.parents, [animal.id])
		})

		test('deleteTag removes the tag so it can no longer be found', async () => {
			const tag = await getTagByLabel(sqlite, 'Animal', true)
			await deleteTag(sqlite, tag.id)
			assert.equal(await getTagById(sqlite, tag.id), null)
		})
	})

	describe('hierarchy: ancestors, descendants, direct children', () => {
		let livingBeing, animal, mammal, cat, dog

		beforeEach(async () => {
			livingBeing = await getTagByLabel(sqlite, 'Living being', true)
			animal = await getTagByLabel(sqlite, 'Animal', true)
			mammal = await getTagByLabel(sqlite, 'Mammal', true)
			cat = await getTagByLabel(sqlite, 'Cat', true)
			dog = await getTagByLabel(sqlite, 'Dog', true)
			// Cat/Dog -> Mammal -> Animal & Living being (multiple inheritance on Mammal)
			await addParent(sqlite, mammal.id, animal.id)
			await addParent(sqlite, mammal.id, livingBeing.id)
			await addParent(sqlite, cat.id, mammal.id)
			await addParent(sqlite, dog.id, mammal.id)
		})

		test('getAncestorIds includes self and every more generic tag, direct and indirect', async () => {
			const ancestors = await getAncestorIds(sqlite, cat.id)
			assert.deepEqual([...ancestors].sort(), [animal.id, cat.id, livingBeing.id, mammal.id].sort())
		})

		test('getDescendantIds includes self and every more specific tag, direct and indirect', async () => {
			const descendants = await getDescendantIds(sqlite, animal.id)
			assert.deepEqual([...descendants].sort(), [animal.id, cat.id, dog.id, mammal.id].sort())
		})

		test('getDescendantIds on a leaf tag returns only itself', async () => {
			assert.deepEqual([...await getDescendantIds(sqlite, cat.id)], [cat.id])
		})

		test('getDirectChildren returns only direct children, not grand-children', async () => {
			const children = (await getDirectChildren(sqlite, animal.id)).map((t) => t.id)
			assert.deepEqual(children, [mammal.id])
		})

		test('getDirectChildren on a leaf tag returns nothing', async () => {
			assert.deepEqual(await getDirectChildren(sqlite, cat.id), [])
		})
	})

	describe('cycle detection', () => {
		let animal, mammal, cat

		beforeEach(async () => {
			animal = await getTagByLabel(sqlite, 'Animal', true)
			mammal = await getTagByLabel(sqlite, 'Mammal', true)
			cat = await getTagByLabel(sqlite, 'Cat', true)
			await addParent(sqlite, mammal.id, animal.id) // Mammal -> Animal
			await addParent(sqlite, cat.id, mammal.id) // Cat -> Mammal
		})

		test('a tag cannot be its own parent', async () => {
			assert.equal(await addParent(sqlite, animal.id, animal.id), 'cycle')
		})

		test('a direct child cannot be added back as a parent (direct cycle)', async () => {
			assert.equal(await addParent(sqlite, mammal.id, cat.id), 'cycle')
		})

		test('an indirect cycle across 3 levels is rejected', async () => {
			assert.equal(await addParent(sqlite, animal.id, cat.id), 'cycle')
		})

		test('adding an already-present parent returns conflict', async () => {
			assert.equal(await addParent(sqlite, mammal.id, animal.id), 'conflict')
		})

		test('adding a parent/child that does not exist returns not_found', async () => {
			assert.equal(await addParent(sqlite, 't:unknown', animal.id), 'not_found')
			assert.equal(await addParent(sqlite, animal.id, 't:unknown'), 'not_found')
		})

		test('a valid, non-cyclic parent link is accepted', async () => {
			const bird = await getTagByLabel(sqlite, 'Bird', true)
			assert.equal(await addParent(sqlite, bird.id, animal.id), 'ok')
			const reloaded = await getTagById(sqlite, bird.id)
			assert.deepEqual(reloaded.parents, [animal.id])
		})

		test('wouldCreateCycle mirrors addParent decisions', async () => {
			assert.equal(await wouldCreateCycle(sqlite, mammal.id, cat.id), true)
			const bird = await getTagByLabel(sqlite, 'Bird', true)
			assert.equal(await wouldCreateCycle(sqlite, bird.id, animal.id), false)
		})

		test('removeParent removes an existing link and is idempotent otherwise', async () => {
			assert.equal(await removeParent(sqlite, mammal.id, animal.id), 'ok')
			const reloaded = await getTagById(sqlite, mammal.id)
			assert.deepEqual(reloaded.parents, [])
			assert.equal(await removeParent(sqlite, mammal.id, animal.id), 'ok')
		})

		test('removeParent on an unknown tag returns not_found', async () => {
			assert.equal(await removeParent(sqlite, 't:unknown', animal.id), 'not_found')
		})
	})
})
