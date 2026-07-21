import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { paginate, normalizePageParams, compareBy, MAX_LIMIT, DEFAULT_LIMIT } from '../../../src/server/lib/pagination.js'

describe('normalizePageParams', () => {
	test('defaults page to 1 and limit to DEFAULT_LIMIT when missing', () => {
		assert.deepEqual(normalizePageParams({}), {page: 1, limit: DEFAULT_LIMIT})
	})

	test('clamps page 0 or negative to 1', () => {
		assert.equal(normalizePageParams({page: 0}).page, 1)
		assert.equal(normalizePageParams({page: -5}).page, 1)
	})

	test('clamps a non-integer/NaN page to 1', () => {
		assert.equal(normalizePageParams({page: 'abc'}).page, 1)
		assert.equal(normalizePageParams({page: 1.5}).page, 1)
	})

	test('clamps limit above MAX_LIMIT down to MAX_LIMIT', () => {
		assert.equal(normalizePageParams({limit: 1000}).limit, MAX_LIMIT)
	})

	test('defaults limit to DEFAULT_LIMIT when <= 0 or invalid', () => {
		assert.equal(normalizePageParams({limit: 0}).limit, DEFAULT_LIMIT)
		assert.equal(normalizePageParams({limit: -1}).limit, DEFAULT_LIMIT)
		assert.equal(normalizePageParams({limit: 'abc'}).limit, DEFAULT_LIMIT)
	})

	test('keeps a valid page/limit unchanged', () => {
		assert.deepEqual(normalizePageParams({page: 3, limit: 10}), {page: 3, limit: 10})
	})
})

describe('paginate', () => {
	const list = Array.from({length: 25}, (_, i) => ({id: i}))

	test('slices the requested page', () => {
		const result = paginate(list, {page: 2, limit: 10})
		assert.deepEqual(result.items.map((i) => i.id), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
	})

	test('total always equals the full list length, regardless of the page requested', () => {
		assert.equal(paginate(list, {page: 1, limit: 10}).total, 25)
		assert.equal(paginate(list, {page: 3, limit: 10}).total, 25)
	})

	test('hasMore is true when more items remain after this page', () => {
		assert.equal(paginate(list, {page: 1, limit: 10}).hasMore, true)
		assert.equal(paginate(list, {page: 2, limit: 10}).hasMore, true)
		assert.equal(paginate(list, {page: 3, limit: 10}).hasMore, false)
	})

	test('a page beyond the total returns an empty items array but coherent metadata', () => {
		const result = paginate(list, {page: 100, limit: 10})
		assert.deepEqual(result.items, [])
		assert.equal(result.total, 25)
		assert.equal(result.hasMore, false)
		assert.equal(result.page, 100)
	})

	test('limit above MAX_LIMIT is clamped before slicing', () => {
		const result = paginate(list, {page: 1, limit: 1000})
		assert.equal(result.limit, MAX_LIMIT)
		assert.equal(result.items.length, 25) // fewer items than the clamped limit
	})

	test('never sorts the list itself: preserves the input order as-is', () => {
		const unsorted = [{id: 3}, {id: 1}, {id: 2}]
		const result = paginate(unsorted, {page: 1, limit: 10})
		assert.deepEqual(result.items.map((i) => i.id), [3, 1, 2])
	})
})

describe('compareBy', () => {
	test('sorts numbers ascending', () => {
		const list = [{v: 3}, {v: 1}, {v: 2}]
		list.sort(compareBy((x) => x.v, 'asc'))
		assert.deepEqual(list.map((x) => x.v), [1, 2, 3])
	})

	test('sorts numbers descending', () => {
		const list = [{v: 3}, {v: 1}, {v: 2}]
		list.sort(compareBy((x) => x.v, 'desc'))
		assert.deepEqual(list.map((x) => x.v), [3, 2, 1])
	})

	test('sorts strings via localeCompare', () => {
		const list = [{v: 'banana'}, {v: 'Apple'}, {v: 'cherry'}]
		list.sort(compareBy((x) => x.v, 'asc'))
		assert.deepEqual(list.map((x) => x.v), ['Apple', 'banana', 'cherry'])
	})

	test('null/undefined values always sort last regardless of direction', () => {
		const list = [{v: 1}, {v: null}, {v: 2}, {v: undefined}]
		const asc = [...list].sort(compareBy((x) => x.v, 'asc')).map((x) => x.v)
		const desc = [...list].sort(compareBy((x) => x.v, 'desc')).map((x) => x.v)
		assert.deepEqual(asc.slice(0, 2), [1, 2])
		assert.deepEqual(desc.slice(0, 2), [2, 1])
	})
})
