import ENTRIES from './entries.js'
import { paginate, compareBy } from '../lib/pagination.js'

const ALL_USERS = {}
class User {
	constructor(username) {
		this.username = username
		this.entries = {} // {entryId: computedScore}
		this.tags = {} // {tagId: computedScore}
		this.quiz = []
	}

	getUserList() {
		const list = []

		const minUserScore = Math.min(...Object.values(this.entries))
		const maxUserScore = Math.max(...Object.values(this.entries))
		for(const entryId in this.entries) {
			const entry = ENTRIES.entries[entryId]
			// Get entries label from DB.entries[id]
			list.push({
				id: entry.id,
				label: entry.name,
				image: entry.image,
				// Stretch score between 0 and 1. With no variance to stretch (a
				// single entry, or every entry tied), fall back to the neutral
				// 0.5 rather than dividing by zero.
				score: maxUserScore === minUserScore ? 0.5 : (this.entries[entryId] - minUserScore) / (maxUserScore - minUserScore),
				globalScore: entry.globalScore,
			})
		}
		return list
	}

	/**
	 * Paginated version of getUserList(): sorts on the RAW user score (min-max
	 * stretching is a monotonic function of the raw score, so sorting before or
	 * after stretching gives the same order), slices the requested page, and
	 * only THEN stretches the page's items — using the min/max computed over
	 * the full entries set, never materializing the whole stretched list.
	 */
	getUserListPaginated({sort, order, page, limit} = {}) {
		const rawEntries = Object.entries(this.entries) // [[entryId, rawScore], ...]
		const minUserScore = Math.min(...Object.values(this.entries))
		const maxUserScore = Math.max(...Object.values(this.entries))
		const range = maxUserScore - minUserScore

		let sortKey
		if(sort === 'label') {
			sortKey = ([id]) => ENTRIES.entries[id]?.name
		} else if(sort === 'globalScore') {
			sortKey = ([id]) => ENTRIES.entries[id]?.globalScore
		} else {
			sortKey = ([, rawScore]) => rawScore // raw user score, before stretching
		}
		const defaultOrder = sort === 'label' ? 'asc' : 'desc'
		rawEntries.sort(compareBy(sortKey, order || defaultOrder))

		const {items, page: p, limit: l, total, hasMore} = paginate(rawEntries, {page, limit})

		const stretchedItems = items.map(([entryId, rawScore]) => {
			const entry = ENTRIES.entries[entryId]
			return {
				id: entry.id,
				label: entry.name,
				image: entry.image,
				score: range === 0 ? 0.5 : (rawScore - minUserScore) / range,
				globalScore: entry.globalScore,
			}
		})

		return {items: stretchedItems, page: p, limit: l, total, hasMore}
	}

	/**
	 * This user's score on a single entry, stretched between 0 and 1 the same
	 * way getUserListPaginated does (min/max taken over ALL of this user's
	 * scored entries, not just the one requested, so a single lookup stays
	 * consistent with the full list). Returns null if the user has no score
	 * on this entry at all.
	 */
	getStretchedScore(entryId) {
		if(!this.entries.hasOwnProperty(entryId)) return null

		const minUserScore = Math.min(...Object.values(this.entries))
		const maxUserScore = Math.max(...Object.values(this.entries))
		if(maxUserScore === minUserScore) return 0.5
		return (this.entries[entryId] - minUserScore) / (maxUserScore - minUserScore)
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
	 * persistenceService.js to persist the true moment of the vote to
	 * SQLite's direct_quiz/dual_quiz `ts` column - it plays no role in the
	 * in-memory model otherwise.
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

function getUser(username) {
	if(!ALL_USERS.hasOwnProperty(username)) ALL_USERS[username] = new User(username)
	return ALL_USERS[username]
}
/**
 * Permanently deletes a user's in-memory data. The caller (userService.js's
 * deleteAccount()) is responsible for also removing the persisted rows - see
 * persistenceService.js - never touching the shared ENTRIES catalog.
 */
function deleteUser(username) {
	delete ALL_USERS[username]
}
/**
 * True if at least one known user still has a vote referencing `entry`.
 * Used to decide whether an entry can be permanently deleted once a single
 * user's votes on it have been removed.
 */
function anyUserReferencesEntry(entry) {
	for(const username in ALL_USERS) {
		if(ALL_USERS[username].quiz.some((q) => q.referencesEntry(entry))) return true
	}
	return false
}

export { getUser, deleteUser, anyUserReferencesEntry, ALL_USERS, User }
