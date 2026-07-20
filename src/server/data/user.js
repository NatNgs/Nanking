import DB from './db.js'
import ENTRIES from './entries.js'
import { loadQuiz } from './quiz.js'

const ALL_USERS = {}
class User {
	constructor(db, username) {
		this.db = db.sub('users.' + username)
		this.username = username
		this.entries = {} // {entryId: computedScore}

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

export { getUser, loadAllUsers, saveAllUsers, deleteUser, ALL_USERS, User }
