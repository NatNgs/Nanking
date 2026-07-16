import DB from './db.js'

class Entry {
	constructor(id, name) {
		this.id = id
		this.name = name
		this.image = 'assets/unknown.svg'
	}
}
class EntriesManager {
	constructor(db) {
		this.db = db.sub('entries')
		this.entries = {}

		// Load entries from db
		for(const entryId in this.db.keys()) {
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
		this.save()

		return entry
	}
	getEntryById(id) {
		return this.entries[id]
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
