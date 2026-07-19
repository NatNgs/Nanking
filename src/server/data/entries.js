import DB from './db.js'

class Entry {
	constructor(id, name) {
		this.id = id
		this.name = name
		this.image = 'assets/unknown.svg'
		this.globalScore = 0.5 // All-users-combined computed score
	}
}
class EntriesManager {
	constructor(db) {
		this.db = db.sub('entries')
		this.entries = {} // id: Entry

		// Load entries from db
		for(const entryId of this.db.keys()) {
			const data = this.db.get(entryId)
			const entry = new Entry(entryId, data.name)
			this.entries[entryId] = entry
		}
	}

	getEntryByName(name, createIfNotExists=false) {
		name = name.trim()

		// Look for an entry with this name in this.entries
		for(const entryId in this.entries) {
			const entry = this.entries[entryId]
			if(entry.name === name) return entry
		}
		if(!createIfNotExists) return null

		// Not found: Create a new entry
		let key = Object.keys(this.entries).length
		while(this.entries[key]) key++
		const entry = new Entry(key, name)
		this.entries[entry.id] = entry

		return entry
	}
	searchEntry(searchInput) {
		// Convert searchInput to regex
		const regex = new RegExp(searchInput.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\s+/g, '\\s+'), 'i')
		const result = []
		for(const entryId in this.entries) {
			const entry = this.entries[entryId]
			if(regex.test(entry.name)) result.push(entry)
		}
		// Sort results by name length (Matches the beginning of the name first, then smaller first), then limit to 32 results
		result.sort((a, b) =>  a.name.length - b.name.length)
		if(result.length > 32) result.length = 32
		return result
	}

	getEntryById(id) {
		return this.entries[id]
	}

	getGlobalScores() {
		const scores = {}
		for(const entryId in this.entries) {
			const entry = this.entries[entryId]
			scores[entry.id] = entry.globalScore
		}
		return scores
	}

	save() {
		// Convert this.entries to proper DB format
		const json = {}
		for(const entryId in this.entries) {
			const entry = this.entries[entryId]
			json[entry.id] = {name: entry.name}
		}
		this.db.set(null, json)
	}
}

const ENTRIES = new EntriesManager(DB)
export default ENTRIES
export { EntriesManager, Entry }
