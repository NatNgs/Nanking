import { DB } from "./db.js";

class Accounts {
	constructor(db) {
		this.db = db.sub('accounts')
	}

	add(login, pwd) {
		// If account already exists, return false
		if(this.db.has(login)) return false
		return this.db.set(login, pwd)
	}
	login(login, pwd) {
		// If account doesn't exist, return false
		if(!this.db.has(login)) return false
		if(this.db.get(login) !== pwd) {
			console.warn(login, pwd, this.db.get(login))
		}
		return this.db.get(login) === pwd
	}
}

const _Accounts = new Accounts(DB)
export {
	_Accounts as Accounts
}
