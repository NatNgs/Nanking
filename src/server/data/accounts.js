import DB from './db.js'
import { v4 as uuidv4 } from 'uuid'

const TOKEN_VALIDITY_LIMIT = 16 * 60 * 60 * 1000 // 16 hours
const TOKEN_REFRESH_RATE = 1 * 60 * 60 * 1000 // 1 hour
const USER_REGEX = /^[a-zA-Z0-9_]{3,16}$/
class AccountManager {
	constructor(db) {
		this.db = db.sub('p#')
		this.tokens = {}
		this.tokens_reverse = {}
	}

	add(user, pwd) {
		// Check: username should match regex
		if(!user.match(USER_REGEX)) return false

		// If account already exists, return false
		if(this.db.has(user)) return false
		this.db.set(user, pwd)
		return true
	}
	login(user, pwd) {
		// Check: username should match regex
		if(!user.match(USER_REGEX)) return false

		// If account doesn't exist, return false
		if(!this.db.has(user)) {
			console.warn('Failed login (account does not exist)', user)
			return false
		}
		if(this.db.get(user) !== pwd) {
			console.warn('Failed login (wrong password)', user)
			return false
		}

		// Create new token, random string
		return this.refresh_token(user)
	}
	check_token(token) {
		if(!this.tokens[token]) {
			console.debug('Unknown token', token)
			return false
		}
		if(Date.now() - this.tokens_reverse[this.tokens[token]].time > TOKEN_VALIDITY_LIMIT) {
			const user = this.tokens[token]
			delete this.tokens[token]
			delete this.tokens_reverse[this.tokens[token]]
			console.debug('Expired token', token, user)
			return false
		}
		return this.tokens[token]
	}
	refresh_token(user) {
		// If current token is not older than TOKEN_REFRESH_RATE, return it without refresh
		if(this.tokens_reverse[user] && Date.now() - this.tokens_reverse[user].time < TOKEN_REFRESH_RATE) {
			return this.tokens_reverse[user].token
		}

		// Do refresh the token
		const token = uuidv4()
		if(this.tokens_reverse[user]) {
			delete this.tokens[this.tokens_reverse[user].token]
		}
		this.tokens[token] = user
		this.tokens_reverse[user] = {token, time: Date.now()}
		//console.debug('Token updated for user', user, token)
		return token
	}
}

const ACCOUNTS = new AccountManager(DB)
export default ACCOUNTS
