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
	constructor() {
		this.entries = {} // id: Entry
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
}

const ENTRIES = new EntriesManager()
export default ENTRIES
export { EntriesManager, Entry }
