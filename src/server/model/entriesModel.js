// Matches a source-prefixed id, e.g. 'n:0' or 'mal:12345'
const ENTRY_ID_FORMAT = /^[a-z0-9_.-]+(:[a-z0-9_.-]+)+$/

class Entry {
	constructor(id, name) {
		if(!ENTRY_ID_FORMAT.test(id)) {
			throw new Error(`Invalid entry id: ${id}`)
		}
		this.id = id
		this.name = name
		this.image = 'assets/unknown.svg'
		this.globalScore = 0.5 // All-users-combined computed score, persisted in entries.global_score
		this.tags = [] // array of tag ids, possibly empty
	}
}

export { Entry }
