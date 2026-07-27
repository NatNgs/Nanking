import { paginate } from '../lib/pagination.js'

class User {
	constructor(username) {
		this.username = username
		this.entries = {} // {entryId: computedScore}
		this.quiz = []
	}

	/**
	 * Paginated, newest-first view of this user's quiz history, optionally
	 * filtered by `type` ('direct' | 'dual'). Never mutates or reorders
	 * `this.quiz` itself: the insertion order backs computeUserScores and
	 * must stay untouched, this only builds a derived, reversed copy for
	 * display. Each item carries `rank`, the 1-based position in the FULL,
	 * unfiltered, chronological (oldest-first) history - stable regardless of
	 * the type filter or which page is requested.
	 */
	getQuizPaginated({type, page, limit} = {}) {
		const ranked = this.quiz.map((quiz, i) => ({quiz, rank: i + 1}))
		const filtered = type ? ranked.filter((entry) => entry.quiz.type === type) : ranked
		const newestFirst = filtered.slice().reverse()

		const {items, page: p, limit: l, total, hasMore} = paginate(newestFirst, {page, limit})
		return {
			items: items.map(({quiz, rank}) => ({...quiz.toJson(), rank})),
			page: p, limit: l, total, hasMore,
		}
	}

	/**
	 * Records a vote, stamping it with the current time. `quiz.ts` is used by
	 * userRepository.js to persist the true moment of the vote to SQLite's
	 * direct_quiz/dual_quiz `ts` column - it plays no role in the in-memory
	 * model otherwise.
	 */
	didQuiz(quiz) {
		quiz.ts = Date.now()
		this.quiz.push(quiz)
	}
	removeQuiz(quiz) {
		this.quiz = this.quiz.filter((q) => !(q.equals(quiz)))
	}
	/**
	 * Removes every vote referencing `entry` and its computed score for this user.
	 * Used when an entry is permanently deleted, to cascade the deletion to all user data.
	 */
	removeAllReferencesToEntry(entry) {
		this.quiz = this.quiz.filter((q) => !q.referencesEntry(entry))
		delete this.entries[entry.id]
	}
}

export { User }
