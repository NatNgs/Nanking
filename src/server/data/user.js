import DB from './db.js'
import ENTRIES from './entries.js'
import { loadQuiz } from './quiz.js'
import { paginate, compareBy } from '../lib/pagination.js'

const ALL_USERS = {}
class User {
	constructor(db, username) {
		this.db = db.sub('users.' + username)
		this.username = username
		this.entries = {} // {entryId: computedScore}
		this.tags = {} // {tagId: computedScore}

		this.quiz = []
		for(const quizData of this.db.get('quiz') || []) {
			this.quiz.push(loadQuiz(quizData))
		}
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

	didQuiz(quiz) {
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

	save() {
		// Convert this.quiz to proper Db format
		const json = []
		for(const quiz of this.quiz) {
			json.push(quiz.toJson())
		}
		this.db.set('quiz', json)
	}

}

function getUser(username) {
	if(!ALL_USERS.hasOwnProperty(username)) ALL_USERS[username] = new User(DB, username)
	return ALL_USERS[username]
}
function loadAllUsers() {
	for(const username in DB.get('users') || {}) {
		ALL_USERS[username] = new User(DB, username)
	}
}
function saveAllUsers() {
	for(const username in ALL_USERS) ALL_USERS[username].save()
}
/**
 * Permanently deletes a user's data (cache + persisted db subtree), never
 * touching the shared ENTRIES catalog.
 */
function deleteUser(username) {
	delete ALL_USERS[username]
	DB.sub('users.' + username).delete(null)
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

export { getUser, loadAllUsers, saveAllUsers, deleteUser, anyUserReferencesEntry, ALL_USERS, User }
