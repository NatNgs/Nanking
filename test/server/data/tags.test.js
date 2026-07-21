import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync, existsSync } from 'fs'
import { Manager } from '../../../src/server/data/db.js'
import { TagsManager, Tag } from '../../../src/server/data/tags.js'
import ENTRIES from '../../../src/server/data/entries.js'

const TEST_DB_PATH = 'test/tmp/tags.test.json'

describe('TagsManager', () => {
	let db

	beforeEach(() => {
		db = new Manager({})
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
	})
	afterEach((t) => {
		if(t.passed && existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
	})

	test('getTagByLabel returns null when missing and createIfNotExists=false', () => {
		const tags = new TagsManager(db)
		assert.equal(tags.getTagByLabel('Animal'), null)
	})

	test('getTagByLabel creates a tag with an incremental id', () => {
		const tags = new TagsManager(db)
		const tag = tags.getTagByLabel('Animal', true)
		assert.equal(tag.label, 'Animal')
		assert.equal(tag.id, 't:0')
		assert.deepEqual(tag.parents, [])
		assert.equal(tag.score, 0.5)
	})

	test('getTagByLabel finds an existing tag by label (no duplicate)', () => {
		const tags = new TagsManager(db)
		const first = tags.getTagByLabel('Animal', true)
		const second = tags.getTagByLabel('Animal', true)
		assert.equal(first.id, second.id)
		assert.equal(Object.keys(tags.tags).length, 1)
	})

	test('getTagById finds a tag by id', () => {
		const tags = new TagsManager(db)
		const created = tags.getTagByLabel('Animal', true)
		assert.equal(tags.getTagById(created.id), created)
	})

	test('getTagByLabelIgnoreCase finds a tag regardless of case, excluding a given id', () => {
		const tags = new TagsManager(db)
		const tag = tags.getTagByLabel('Animal', true)
		assert.equal(tags.getTagByLabelIgnoreCase('ANIMAL'), tag)
		assert.equal(tags.getTagByLabelIgnoreCase('animal', tag.id), null)
	})

	test('save() then reload round-trips the label and parents', () => {
		const tags = new TagsManager(db)
		const animal = tags.getTagByLabel('Animal', true)
		const cat = tags.getTagByLabel('Cat', true)
		tags.addParent(cat.id, animal.id)
		tags.save()

		const reloaded = new TagsManager(db)
		assert.equal(reloaded.getTagById(cat.id).label, 'Cat')
		assert.deepEqual(reloaded.getTagById(cat.id).parents, [animal.id])
	})

	test('db.save() then db.load() on disk round-trips tags', () => {
		const tags = new TagsManager(db)
		const animal = tags.getTagByLabel('Animal', true)
		const cat = tags.getTagByLabel('Cat', true)
		tags.addParent(cat.id, animal.id)
		tags.save()
		db.save(TEST_DB_PATH)

		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)
		const reloadedTags = new TagsManager(reloadedDb)
		assert.deepEqual(reloadedTags.getTagById(cat.id).parents, [animal.id])
	})

	test('save() omits a tag with no relation at all (no parent, no derived child, no linked entry)', () => {
		const tags = new TagsManager(db)
		const orphan = tags.getTagByLabel('Orphan', true)
		const animal = tags.getTagByLabel('Animal', true)
		const cat = tags.getTagByLabel('Cat', true)
		tags.addParent(cat.id, animal.id)
		tags.save()

		const reloaded = new TagsManager(db)
		assert.equal(reloaded.getTagById(orphan.id), undefined)
		assert.ok(reloaded.getTagById(animal.id))
		assert.ok(reloaded.getTagById(cat.id))
	})

	test('save() keeps a tag with no parent/child but linked to an entry', () => {
		const tags = new TagsManager(db)
		const linked = tags.getTagByLabel('Linked', true)
		const entry = ENTRIES.getEntryByName('Some entry', true)
		entry.tags.push(linked.id)
		tags.save()

		const reloaded = new TagsManager(db)
		assert.ok(reloaded.getTagById(linked.id))
	})

	test('deleteTag removes the tag so it can no longer be found by id', () => {
		const tags = new TagsManager(db)
		const tag = tags.getTagByLabel('Animal', true)
		delete tags.tags[tag.id]
		assert.equal(tags.getTagById(tag.id), undefined)
	})
})

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

describe('TagsManager loading with invalid stored ids/parents', () => {
	test('skips a tag whose id fails validation, and still loads the others', () => {
		const db = new Manager({})
		db.set('tags', {
			't:0': {label: 'Valid tag'},
			'invalid id': {label: 'Broken tag'},
			't:1': {label: 'Another valid tag'},
		})

		const tags = new TagsManager(db)

		assert.equal(Object.keys(tags.tags).length, 2)
		assert.equal(tags.getTagById('t:0').label, 'Valid tag')
		assert.equal(tags.getTagById('t:1').label, 'Another valid tag')
		assert.equal(tags.getTagById('invalid id'), undefined)
	})

	test('drops a parent id pointing to a tag that failed to load', () => {
		const db = new Manager({})
		db.set('tags', {
			't:0': {label: 'Cat', parents: ['invalid id', 't:1']},
			't:1': {label: 'Animal'},
		})

		const tags = new TagsManager(db)
		assert.deepEqual(tags.getTagById('t:0').parents, ['t:1'])
	})
})

describe('TagsManager hierarchy: ancestors, descendants, direct children', () => {
	let db, tags, animal, mammal, cat, dog, livingBeing

	beforeEach(() => {
		db = new Manager({})
		tags = new TagsManager(db)
		livingBeing = tags.getTagByLabel('Living being', true)
		animal = tags.getTagByLabel('Animal', true)
		mammal = tags.getTagByLabel('Mammal', true)
		cat = tags.getTagByLabel('Cat', true)
		dog = tags.getTagByLabel('Dog', true)
		// Cat/Dog -> Mammal -> Animal & Living being (multiple inheritance on Mammal)
		tags.addParent(mammal.id, animal.id)
		tags.addParent(mammal.id, livingBeing.id)
		tags.addParent(cat.id, mammal.id)
		tags.addParent(dog.id, mammal.id)
	})

	test('getAncestors includes self and every more generic tag, direct and indirect', () => {
		const ancestors = tags.getAncestors(cat.id)
		assert.deepEqual([...ancestors].sort(), [animal.id, cat.id, livingBeing.id, mammal.id].sort())
	})

	test('getDescendants includes self and every more specific tag, direct and indirect', () => {
		const descendants = tags.getDescendants(animal.id)
		assert.deepEqual([...descendants].sort(), [animal.id, cat.id, dog.id, mammal.id].sort())
	})

	test('getDescendants on a leaf tag returns only itself', () => {
		assert.deepEqual([...tags.getDescendants(cat.id)], [cat.id])
	})

	test('getDirectChildren returns only direct children, not grand-children', () => {
		const children = tags.getDirectChildren(animal.id).map((t) => t.id)
		assert.deepEqual(children, [mammal.id])
	})

	test('getDirectChildren on a leaf tag returns nothing', () => {
		assert.deepEqual(tags.getDirectChildren(cat.id), [])
	})
})

describe('TagsManager cycle detection', () => {
	let db, tags, animal, mammal, cat

	beforeEach(() => {
		db = new Manager({})
		tags = new TagsManager(db)
		animal = tags.getTagByLabel('Animal', true)
		mammal = tags.getTagByLabel('Mammal', true)
		cat = tags.getTagByLabel('Cat', true)
		tags.addParent(mammal.id, animal.id) // Mammal -> Animal
		tags.addParent(cat.id, mammal.id) // Cat -> Mammal
	})

	test('a tag cannot be its own parent', () => {
		assert.equal(tags.addParent(animal.id, animal.id), 'cycle')
	})

	test('a direct child cannot be added back as a parent (direct cycle)', () => {
		// Mammal already has Cat as a descendant: making Cat a parent of Mammal would cycle
		assert.equal(tags.addParent(mammal.id, cat.id), 'cycle')
	})

	test('an indirect cycle across 3 levels is rejected', () => {
		// Animal -> ... -> Cat already (Cat is a descendant of Animal): Animal cannot become Cat's descendant
		assert.equal(tags.addParent(animal.id, cat.id), 'cycle')
	})

	test('adding an already-present parent returns conflict', () => {
		assert.equal(tags.addParent(mammal.id, animal.id), 'conflict')
	})

	test('adding a parent/child that does not exist returns not_found', () => {
		assert.equal(tags.addParent('t:unknown', animal.id), 'not_found')
		assert.equal(tags.addParent(animal.id, 't:unknown'), 'not_found')
	})

	test('a valid, non-cyclic parent link is accepted', () => {
		const bird = tags.getTagByLabel('Bird', true)
		assert.equal(tags.addParent(bird.id, animal.id), 'ok')
		assert.deepEqual(bird.parents, [animal.id])
	})

	test('removeParent removes an existing link and is idempotent otherwise', () => {
		assert.equal(tags.removeParent(mammal.id, animal.id), 'ok')
		assert.deepEqual(mammal.parents, [])
		assert.equal(tags.removeParent(mammal.id, animal.id), 'ok') // already absent, still ok
	})

	test('removeParent on an unknown tag returns not_found', () => {
		assert.equal(tags.removeParent('t:unknown', animal.id), 'not_found')
	})
})

describe('TagsManager.topologicalOrder', () => {
	test('every tag appears before each of its direct parents', () => {
		const db = new Manager({})
		const tags = new TagsManager(db)
		const livingBeing = tags.getTagByLabel('Living being', true)
		const animal = tags.getTagByLabel('Animal', true)
		const mammal = tags.getTagByLabel('Mammal', true)
		const cat = tags.getTagByLabel('Cat', true)
		const dog = tags.getTagByLabel('Dog', true)
		tags.addParent(mammal.id, animal.id)
		tags.addParent(mammal.id, livingBeing.id)
		tags.addParent(cat.id, mammal.id)
		tags.addParent(dog.id, mammal.id)

		const order = tags.topologicalOrder()
		const indexOf = (id) => order.indexOf(id)

		for(const tagId in tags.tags) {
			const tag = tags.tags[tagId]
			for(const parentId of tag.parents) {
				assert.ok(indexOf(tagId) < indexOf(parentId), `${tagId} should appear before its parent ${parentId}`)
			}
		}
		assert.equal(order.length, Object.keys(tags.tags).length)
	})

	test('handles unrelated tags and isolated tags without error', () => {
		const db = new Manager({})
		const tags = new TagsManager(db)
		tags.getTagByLabel('Alone', true)
		tags.getTagByLabel('AlsoAlone', true)

		const order = tags.topologicalOrder()
		assert.equal(order.length, 2)
	})
})
