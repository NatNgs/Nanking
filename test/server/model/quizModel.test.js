import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Entry } from '../../../src/server/model/entriesModel.js'
import { DirectQuiz, DualQuiz } from '../../../src/server/model/quizModel.js'

describe('DirectQuiz.referencesEntry', () => {
	test('returns true for the entry it was created with', () => {
		const entry = new Entry('n:0', 'A')
		const quiz = new DirectQuiz(entry, 0.5)
		assert.equal(quiz.referencesEntry(entry), true)
	})

	test('returns false for a different entry', () => {
		const entry = new Entry('n:0', 'A')
		const other = new Entry('n:1', 'B')
		const quiz = new DirectQuiz(entry, 0.5)
		assert.equal(quiz.referencesEntry(other), false)
	})

	test(
		'returns true for a distinct Entry instance sharing the same id (no long-lived entries cache: '
		+ 'entries are reloaded fresh from SQLite on every request)',
		() => {
			const entry = new Entry('n:0', 'A')
			// separate instance, same id - as getEntryById() would return on a later call
			const reloadedEntry = new Entry('n:0', 'A')
			const quiz = new DirectQuiz(entry, 0.5)
			assert.equal(quiz.referencesEntry(reloadedEntry), true)
		})
})

describe('DirectQuiz.equals', () => {
	test('two quizzes on the same entry (by id, even as distinct instances) are equal', () => {
		const entry = new Entry('n:0', 'A')
		const reloadedEntry = new Entry('n:0', 'A')
		const quiz1 = new DirectQuiz(entry, 0.5)
		const quiz2 = new DirectQuiz(reloadedEntry, 0.9) // value doesn't matter for equals()
		assert.equal(quiz1.equals(quiz2), true)
	})

	test('quizzes on different entries are not equal', () => {
		const a = new Entry('n:0', 'A')
		const b = new Entry('n:1', 'B')
		const quiz1 = new DirectQuiz(a, 0.5)
		const quiz2 = new DirectQuiz(b, 0.5)
		assert.equal(quiz1.equals(quiz2), false)
	})
})

describe('DualQuiz.referencesEntry', () => {
	test('returns true for neg', () => {
		const neg = new Entry('n:0', 'A')
		const pos = new Entry('n:1', 'B')
		const quiz = new DualQuiz(neg, pos, 1)
		assert.equal(quiz.referencesEntry(neg), true)
	})

	test('returns true for pos', () => {
		const neg = new Entry('n:0', 'A')
		const pos = new Entry('n:1', 'B')
		const quiz = new DualQuiz(neg, pos, 1)
		assert.equal(quiz.referencesEntry(pos), true)
	})

	test('returns false for a third-party entry', () => {
		const neg = new Entry('n:0', 'A')
		const pos = new Entry('n:1', 'B')
		const other = new Entry('n:2', 'C')
		const quiz = new DualQuiz(neg, pos, 1)
		assert.equal(quiz.referencesEntry(other), false)
	})

	test('returns true for a distinct Entry instance sharing the same id as neg or pos', () => {
		const neg = new Entry('n:0', 'A')
		const pos = new Entry('n:1', 'B')
		const quiz = new DualQuiz(neg, pos, 1)
		assert.equal(quiz.referencesEntry(new Entry('n:0', 'A')), true)
		assert.equal(quiz.referencesEntry(new Entry('n:1', 'B')), true)
	})
})

describe('DualQuiz.equals', () => {
	test('two quizzes on the same neg/pos pair (by id, even as distinct instances) are equal', () => {
		const neg = new Entry('n:0', 'A')
		const pos = new Entry('n:1', 'B')
		const quiz1 = new DualQuiz(neg, pos, 1)
		const quiz2 = new DualQuiz(new Entry('n:0', 'A'), new Entry('n:1', 'B'), -1)
		assert.equal(quiz1.equals(quiz2), true)
	})

	test('a reversed neg/pos pair is still equal (order-independent)', () => {
		const neg = new Entry('n:0', 'A')
		const pos = new Entry('n:1', 'B')
		const quiz1 = new DualQuiz(neg, pos, 1)
		const quiz2 = new DualQuiz(new Entry('n:1', 'B'), new Entry('n:0', 'A'), 1)
		assert.equal(quiz1.equals(quiz2), true)
	})

	test('quizzes on different entry pairs are not equal', () => {
		const quiz1 = new DualQuiz(new Entry('n:0', 'A'), new Entry('n:1', 'B'), 1)
		const quiz2 = new DualQuiz(new Entry('n:0', 'A'), new Entry('n:2', 'C'), 1)
		assert.equal(quiz1.equals(quiz2), false)
	})
})
