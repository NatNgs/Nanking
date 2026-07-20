import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Entry } from '../../../src/server/data/entries.js'
import { DefaultValueQuiz, DualQuiz } from '../../../src/server/data/quiz.js'

describe('DefaultValueQuiz.referencesEntry', () => {
	test('returns true for the entry it was created with', () => {
		const entry = new Entry(0, 'A')
		const quiz = new DefaultValueQuiz(entry, 0.5)
		assert.equal(quiz.referencesEntry(entry), true)
	})

	test('returns false for a different entry', () => {
		const entry = new Entry(0, 'A')
		const other = new Entry(1, 'B')
		const quiz = new DefaultValueQuiz(entry, 0.5)
		assert.equal(quiz.referencesEntry(other), false)
	})
})

describe('DualQuiz.referencesEntry', () => {
	test('returns true for neg', () => {
		const neg = new Entry(0, 'A')
		const pos = new Entry(1, 'B')
		const quiz = new DualQuiz(neg, pos, 1)
		assert.equal(quiz.referencesEntry(neg), true)
	})

	test('returns true for pos', () => {
		const neg = new Entry(0, 'A')
		const pos = new Entry(1, 'B')
		const quiz = new DualQuiz(neg, pos, 1)
		assert.equal(quiz.referencesEntry(pos), true)
	})

	test('returns false for a third-party entry', () => {
		const neg = new Entry(0, 'A')
		const pos = new Entry(1, 'B')
		const other = new Entry(2, 'C')
		const quiz = new DualQuiz(neg, pos, 1)
		assert.equal(quiz.referencesEntry(other), false)
	})
})
