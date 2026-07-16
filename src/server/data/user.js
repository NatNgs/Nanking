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

		this.db.set('entries.' + entry.id, score)
	}

	getUserList() {
		// Format list as: {'entry label': {man:manual_score, cur:computed_score}, ...}
		const list = {}
		for(const entryId in this.entries) {
			// Get entries label from DB.entries[id]
			list[ENTRIES.entries[entryId].name] = this.entries[entryId]
		}
		console.debug('User::getUserList', this.entries, ENTRIES.entries, list)
		return list
	}

}


const USERS_CACHE = {}
function getUser(username) {
	if(!USERS_CACHE.hasOwnProperty(username)) USERS_CACHE[username] = new User(DB, username)
	return USERS_CACHE[username]
}

export { getUser }
