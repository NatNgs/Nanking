import { FSDB } from "file-system-db";

class Manager {
	constructor(db, key=null) {
		this.db = db
		this.parent = key || null
		this.db.readData()
	}

	// Sub-managers
	sub(key) {
		return new Manager(this.db, (this.parent?this.parent + '.' : '') + key)
	}

	// Access
	get(key) {
		return this.db.get(this.parent + (key ? '.' +key : ''))
	}
	set(key, value) {
		return this.db.set(this.parent + (key ? '.' +key : ''), value)
	}
	delete(key) {
		return this.db.delete(this.parent + (key ? '.' +key : ''))
	}

	// Collections
	keys() {
		return Object.keys(this.db.get(this.parent) || {})
	}
	has(key) {
		return this.db.has(this.parent + '.' + key)
	}
}

const DB = new Manager(new FSDB('data/Nanking-server.json', true))
export default DB
