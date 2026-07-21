import DB from './db.js'

// Matches a source-prefixed id, e.g. 'n:0' or 'mal:12345'
const ENTRY_ID_FORMAT = /^[a-z0-9_.-]+(:[a-z0-9_.-]+)+$/

class Entry {
	constructor(id, name) {
		if(!ENTRY_ID_FORMAT.test(id)) {
			throw new Error(`Identifiant d'entry invalide : ${id}`)
		}
		this.id = id
		this.name = name
		this.image = 'assets/unknown.svg'
		this.globalScore = 0.5 // All-users-combined computed score
		this.tags = [] // array of tag ids, possibly empty
	}
}
class EntriesManager {
	constructor(db) {
		this.db = db.sub('entries')
		this.entries = {} // id: Entry

		// Load entries from db
		for(const entryId of this.db.keys()) {
			try {
				const data = this.db.get(entryId)
				const entry = new Entry(entryId, data.name)
				if(data.image) entry.image = data.image
				if(Array.isArray(data.tags)) entry.tags = data.tags.slice()
				this.entries[entryId] = entry
			} catch(err) {
				console.error(`Impossible de charger l'entry '${entryId}' :`, err.message)
			}
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
		while(this.entries['n:' + key] !== undefined) key++
		const entry = new Entry('n:' + key, name)
		this.entries[entry.id] = entry

		return entry
	}
	/**
	 * Looks for an entry whose name matches `name` case-insensitively, skipping
	 * `excludeEntryId` (typically the entry being renamed, so it never conflicts with itself).
	 */
	getEntryByNameIgnoreCase(name, excludeEntryId=null) {
		const lower = name.trim().toLowerCase()
		for(const entryId in this.entries) {
			if(entryId === String(excludeEntryId)) continue
			if(this.entries[entryId].name.toLowerCase() === lower) return this.entries[entryId]
		}
		return null
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

	deleteEntry(id) {
		delete this.entries[id]
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
			json[entry.id] = {name: entry.name, image: entry.image, tags: entry.tags}
		}
		this.db.set(null, json)
	}
}

const ENTRIES = new EntriesManager(DB)
export default ENTRIES
export { EntriesManager, Entry }
