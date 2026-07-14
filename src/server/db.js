import { FSDB } from "file-system-db";

class Manager {
	constructor(db, key=null) {
		this.db = db
		this.parent = key || 'nanking'
	}

	has(key) {
		return this.db.has(this.parent + '.' + key)
	}
	get(key) {
		return this.db.get(this.parent + '.' + key)
	}
	set(key, value) {
		return this.db.set(this.parent + '.' +key, value)
	}
	delete(key) {
		return this.db.delete(this.parent + '.' + key)
	}

	sub(key) {
		return new Manager(this.db, this.parent + '.' + key)
	}
}

const DB_Manager = new Manager(new FSDB('./Nanking-server.json', true)
)
export { DB_Manager as DB }
