import DB from './db.js'
import ENTRIES from './entries.js'

class User {
	constructor(db, username) {
		this.db = db.sub('users.' + username)
		this.username = username
		this.entries = {} // {entryId: {man:manualScore, cur:computedScore}}

		// Load entries from db
		for(const entryId in this.db.get('entries') || {}) {
			const score = this.db.get('entries.' + entryId)
			this.entries[entryId] = {entry: ENTRIES.getEntryById(entryId), man:score, cur:score}
		}
	}

	setEntryScore(entryName, score) {
		const entry = ENTRIES.getEntryByName(entryName, true)
		this.entries[entry.id] = {entry, man:score, cur:score}
	}

	getUserList() {
		const list = []
		for(const entryId in this.entries) {
			const entry = ENTRIES.entries[entryId]
			const score = this.entries[entryId]
			// Get entries label from DB.entries[id]
			list.push({
				id: entry.id,
				label: entry.name,
				image: entry.image,
				man: score.man,
				cur: score.cur,
			})
		}
		return list
	}

	save() {
		// Convert this.entries to proper DB format
		const json = {}
		for(const entryId in this.entries) {
			json[entryId] = this.entries[entryId].man
		}
		this.db.set('entries', json)
	}

}


const USERS_CACHE = {}
function getUser(username) {
	if(!USERS_CACHE.hasOwnProperty(username)) USERS_CACHE[username] = new User(DB, username)
	return USERS_CACHE[username]
}
function saveAllUsers() {
	for(const username in USERS_CACHE) USERS_CACHE[username].save()
}
/**
 * Permanently deletes a user's data (cache + persisted db subtree), never
 * touching the shared ENTRIES catalog.
 */
function deleteUser(username) {
	delete USERS_CACHE[username]
	DB.sub('users.' + username).delete(null)
}

export { getUser, saveAllUsers, deleteUser, User }
