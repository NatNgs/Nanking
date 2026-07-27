// Matches a tag id, e.g. 't:0' or 't:12'
const TAG_ID_FORMAT = /^t:[a-z0-9_.-]+$/

class Tag {
	constructor(id, label) {
		if(!TAG_ID_FORMAT.test(id)) {
			throw new Error(`Invalid tag id: ${id}`)
		}
		this.id = id
		this.label = label
		this.parents = [] // ids of more generic tags this tag inherits from (e.g. "Chat".parents = ["Animal"])
	}
}

export { Tag }
