import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import ENTRIES from '../../../src/server/data/entries.js'
import { Entry } from '../../../src/server/data/entries.js'
import TAGS from '../../../src/server/data/tags.js'
import { Tag } from '../../../src/server/data/tags.js'
import {
	getTagData, renameTag, getOrCreateTag, addTagParent, removeTagParent,
	getParentTree, getChildTree, getEntriesForTag, isTagCoveredByEntry,
	addTagToEntry, removeTagFromEntry, resolveEntryTags, searchTags,
} from '../../../src/server/services/tagService.js'

describe('tagService', () => {
	beforeEach(() => {
		for(const key in ENTRIES.entries) delete ENTRIES.entries[key]
		for(const key in TAGS.tags) delete TAGS.tags[key]
	})

	describe('getTagData', () => {
		test('returns null for an unknown tag', () => {
			assert.equal(getTagData('unknown'), null)
		})

		test('returns the tag fields', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:0'].score = 0.7
			const data = getTagData('t:0')
			assert.equal(data.id, 't:0')
			assert.equal(data.label, 'Animal')
			assert.equal(data.score, 0.7)
			assert.deepEqual(data.parents, [])
		})
	})

	describe('renameTag', () => {
		test('returns not_found for an unknown tag', () => {
			assert.equal(renameTag('unknown', 'New label'), 'not_found')
		})

		test('returns invalid for an empty label', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			assert.equal(renameTag('t:0', '   '), 'invalid')
			assert.equal(TAGS.tags['t:0'].label, 'Animal')
		})

		test('returns conflict when another tag already has this label (case-insensitive)', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Mammal')
			assert.equal(renameTag('t:1', 'animal'), 'conflict')
			assert.equal(TAGS.tags['t:1'].label, 'Mammal')
		})

		test('renames and persists when there is no conflict', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			assert.equal(renameTag('t:0', 'Renamed'), 'ok')
			assert.equal(TAGS.tags['t:0'].label, 'Renamed')
		})
	})

	describe('getOrCreateTag', () => {
		test('creates a new tag when none matches the label', () => {
			const tag = getOrCreateTag('Animal')
			assert.equal(tag.label, 'Animal')
			assert.ok(TAGS.tags[tag.id])
		})

		test('returns the existing tag by exact label (idempotent)', () => {
			const first = getOrCreateTag('Animal')
			const second = getOrCreateTag('Animal')
			assert.equal(first.id, second.id)
			assert.equal(Object.keys(TAGS.tags).length, 1)
		})
	})

	describe('addTagParent / removeTagParent', () => {
		test('addTagParent delegates to TAGS.addParent and persists', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Cat')
			TAGS.tags['t:1'] = new Tag('t:1', 'Animal')
			assert.equal(addTagParent('t:0', 't:1'), 'ok')
			assert.deepEqual(TAGS.tags['t:0'].parents, ['t:1'])
		})

		test('addTagParent rejects a cycle', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Cat')
			TAGS.tags['t:1'] = new Tag('t:1', 'Animal')
			addTagParent('t:0', 't:1')
			assert.equal(addTagParent('t:1', 't:0'), 'cycle')
		})

		test('removeTagParent removes the link', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Cat')
			TAGS.tags['t:1'] = new Tag('t:1', 'Animal')
			addTagParent('t:0', 't:1')
			assert.equal(removeTagParent('t:0', 't:1'), 'ok')
			assert.deepEqual(TAGS.tags['t:0'].parents, [])
		})
	})

	describe('getParentTree / getChildTree', () => {
		beforeEach(() => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Living being')
			TAGS.tags['t:1'] = new Tag('t:1', 'Animal')
			TAGS.tags['t:2'] = new Tag('t:2', 'Mammal')
			TAGS.tags['t:3'] = new Tag('t:3', 'Cat')
			addTagParent('t:2', 't:1') // Mammal -> Animal
			addTagParent('t:2', 't:0') // Mammal -> Living being
			addTagParent('t:3', 't:2') // Cat -> Mammal
		})

		test('getParentTree returns direct parents with their own direct parents (depth 2)', () => {
			const tree = getParentTree('t:2') // Mammal
			const ids = tree.map((n) => n.id).sort()
			assert.deepEqual(ids, ['t:0', 't:1'])
			for(const node of tree) assert.deepEqual(node.parents, [])
		})

		test('getParentTree on a leaf tag returns an empty array', () => {
			assert.deepEqual(getParentTree('t:0'), [])
		})

		test('getChildTree returns direct children (derived) with their own direct children', () => {
			const tree = getChildTree('t:1') // Animal
			assert.equal(tree.length, 1)
			assert.equal(tree[0].id, 't:2') // Mammal
			assert.deepEqual(tree[0].children.map((c) => c.id), ['t:3']) // Cat
		})

		test('getChildTree on a leaf tag returns an empty array', () => {
			assert.deepEqual(getChildTree('t:3'), [])
		})
	})

	describe('getEntriesForTag', () => {
		beforeEach(() => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Cat')
			addTagParent('t:1', 't:0') // Cat -> Animal
		})

		test('counts an entry tagged directly with the tag', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Direct')
			ENTRIES.entries['n:0'].tags.push('t:0')
			const result = getEntriesForTag('t:0')
			assert.deepEqual(result.map((e) => e.id), ['n:0'])
		})

		test('counts an entry tagged with a more specific (descendant) tag, via inheritance', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Cat entry')
			ENTRIES.entries['n:0'].tags.push('t:1') // tagged Cat, inherits Animal
			const result = getEntriesForTag('t:0') // Animal
			assert.deepEqual(result.map((e) => e.id), ['n:0'])
		})

		test('does not count an entry tagged only with a more generic (ancestor) tag, wrong direction', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Animal entry')
			ENTRIES.entries['n:0'].tags.push('t:0') // tagged Animal only
			const result = getEntriesForTag('t:1') // Cat: Animal entries are not Cat entries
			assert.deepEqual(result, [])
		})

		test('does not list the same entry twice even with multiple relevant tags', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'Both')
			ENTRIES.entries['n:0'].tags.push('t:0', 't:1')
			const result = getEntriesForTag('t:0')
			assert.equal(result.length, 1)
		})
	})

	describe('isTagCoveredByEntry', () => {
		beforeEach(() => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Cat')
			addTagParent('t:1', 't:0') // Cat -> Animal
		})

		test('true when the tag is already directly present', () => {
			const entry = new Entry('n:0', 'A')
			entry.tags.push('t:0')
			assert.equal(isTagCoveredByEntry(entry, 't:0'), true)
		})

		test('true when a direct tag on the entry is more specific (already inherits the target tag)', () => {
			const entry = new Entry('n:0', 'A')
			entry.tags.push('t:1') // Cat
			assert.equal(isTagCoveredByEntry(entry, 't:0'), true) // Animal already inherited
		})

		test('false when the entry only has a more generic tag (does not inherit the more specific one)', () => {
			const entry = new Entry('n:0', 'A')
			entry.tags.push('t:0') // Animal
			assert.equal(isTagCoveredByEntry(entry, 't:1'), false) // Cat not covered
		})

		test('false when unrelated', () => {
			TAGS.tags['t:2'] = new Tag('t:2', 'Unrelated')
			const entry = new Entry('n:0', 'A')
			entry.tags.push('t:0')
			assert.equal(isTagCoveredByEntry(entry, 't:2'), false)
		})
	})

	describe('addTagToEntry / removeTagFromEntry', () => {
		test('returns not_found for an unknown entry or tag', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			assert.equal(addTagToEntry('unknown', 't:0'), 'not_found')
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			assert.equal(addTagToEntry('n:0', 'unknown'), 'not_found')
		})

		test('adds the tag and persists', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			assert.equal(addTagToEntry('n:0', 't:0'), 'ok')
			assert.deepEqual(ENTRIES.entries['n:0'].tags, ['t:0'])
		})

		test('returns already_covered when the tag or an ancestor is already present', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Cat')
			addTagParent('t:1', 't:0')
			ENTRIES.entries['n:0'].tags.push('t:1') // Cat

			assert.equal(addTagToEntry('n:0', 't:0'), 'already_covered') // Animal already inherited
		})

		test('removeTagFromEntry removes only the direct link, idempotently', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].tags.push('t:0')
			assert.equal(removeTagFromEntry('n:0', 't:0'), 'ok')
			assert.deepEqual(ENTRIES.entries['n:0'].tags, [])
			assert.equal(removeTagFromEntry('n:0', 't:0'), 'ok') // already absent, still ok
		})

		test('removeTagFromEntry returns not_found for an unknown entry', () => {
			assert.equal(removeTagFromEntry('unknown', 't:0'), 'not_found')
		})
	})

	describe('resolveEntryTags', () => {
		test('resolves direct tag ids into {id, label} pairs', () => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			const entry = new Entry('n:0', 'A')
			entry.tags.push('t:0')
			assert.deepEqual(resolveEntryTags(entry), [{id: 't:0', label: 'Animal'}])
		})

		test('skips a tag id that no longer resolves', () => {
			const entry = new Entry('n:0', 'A')
			entry.tags.push('t:unknown')
			assert.deepEqual(resolveEntryTags(entry), [])
		})
	})

	describe('searchTags', () => {
		beforeEach(() => {
			TAGS.tags['t:0'] = new Tag('t:0', 'Animal')
			TAGS.tags['t:1'] = new Tag('t:1', 'Mammal')
			TAGS.tags['t:2'] = new Tag('t:2', 'Cat')
			addTagParent('t:1', 't:0') // Mammal -> Animal
			addTagParent('t:2', 't:1') // Cat -> Mammal
		})

		test('with no filter, returns every tag', () => {
			const result = searchTags({})
			assert.equal(result.length, 3)
		})

		test('q filters by label substring/regex, like searchTag', () => {
			// "Ma" matches both "Mammal" and "Animal" (case-insensitive substring)
			const result = searchTags({q: 'Ma'})
			assert.deepEqual(result.map((t) => t.id).sort(), ['t:0', 't:1'])
		})

		test('q with no substring match returns nothing', () => {
			const result = searchTags({q: 'zzz'})
			assert.deepEqual(result, [])
		})

		test('notOnEntity excludes tags already covered on the entry', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].tags.push('t:2') // Cat: covers Cat, Mammal, Animal
			const result = searchTags({notOnEntity: 'n:0'})
			assert.deepEqual(result, [])
		})

		test('notHavingAsChild excludes candidates that would create a cycle as a parent of the given tag (its descendants)', () => {
			// Proposing valid parents for Mammal (t:1): Cat is Mammal's descendant,
			// adding it as Mammal's parent would create a cycle. Animal remains valid.
			const result = searchTags({notHavingAsChild: ['t:1']})
			assert.deepEqual(result.map((t) => t.id), ['t:0'])
		})

		test('notHavingAsChild excludes the tag itself too (its own descendant closure includes it)', () => {
			// Proposing valid parents for Animal (t:0): its whole descendant closure
			// (Animal, Mammal, Cat) is excluded, nothing remains.
			const result = searchTags({notHavingAsChild: ['t:0']})
			assert.deepEqual(result, [])
		})

		test('notHavingAsParent excludes candidates that would create a cycle as a child of the given tag (its ancestors)', () => {
			// Proposing valid children for Mammal (t:1): Animal is Mammal's ancestor,
			// adding it as Mammal's child would create a cycle. Cat remains valid.
			const result = searchTags({notHavingAsParent: ['t:1']})
			assert.deepEqual(result.map((t) => t.id), ['t:2'])
		})

		test('combines multiple filters', () => {
			ENTRIES.entries['n:0'] = new Entry('n:0', 'A')
			ENTRIES.entries['n:0'].tags.push('t:0') // Animal
			const result = searchTags({notOnEntity: 'n:0', notHavingAsChild: ['t:1']})
			// notOnEntity excludes Animal (t:0, already covered); notHavingAsChild(Mammal)
			// excludes Mammal's descendants (Mammal, Cat). Nothing valid remains.
			assert.deepEqual(result, [])
		})
	})
})
