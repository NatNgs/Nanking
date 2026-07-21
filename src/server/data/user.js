import DB from './db.js'
import ENTRIES from './entries.js'
import { loadQuiz } from './quiz.js'

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
