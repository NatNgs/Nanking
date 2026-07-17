import DB from './db.js'
import { v4 as uuidv4 } from 'uuid'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import CONFIG from '../config/config.js'

const TOKEN_VALIDITY_LIMIT = CONFIG.TOKEN_VALIDITY_LIMIT
const TOKEN_REFRESH_RATE = CONFIG.TOKEN_REFRESH_RATE
const USER_REGEX = /^[a-z0-9_.-]{4,20}$/

/**
 * Hashes the password (already hashed client-side) with the user's server-side salt.
 * The salt is never transmitted by the API: it never leaves the server.
 */
function hashWithSalt(pwd, salt) {
	return scryptSync(pwd, salt, 64).toString('hex')
}

class AccountManager {
	constructor(db) {
		this.db = db.sub('p#')
		this.accounts = {} // {user: {hash, salt}}
		this.tokens = {}
		this.tokens_reverse = {}

		// Load accounts from db
		for(const user of this.db.keys()) {
			this.accounts[user] = this.db.get(user)
		}
	}

	add(user, pwd) {
		if(!user || !pwd) return false

		// Check: username should match regex
		user = user.trim().toLowerCase()
		if(!user.match(USER_REGEX)) return false

		// If account already exists, return false
		if(this.accounts[user]) return false

		const salt = randomBytes(16).toString('hex')
		this.accounts[user] = {hash: hashWithSalt(pwd, salt), salt}
		return true
	}
	login(user, pwd) {
		if(!user || !pwd) return false

		// Check: username should match regex
		user = user.trim().toLowerCase()
		if(!user.match(USER_REGEX)) return false

		// If account doesn't exist, return false
		const account = this.accounts[user]
		if(!account) {
			console.warn('Failed login (account does not exist)', user)
			return false
		}
		const hash = hashWithSalt(pwd, account.salt)
		if(!timingSafeEqual(Buffer.from(hash), Buffer.from(account.hash))) {
			console.warn('Failed login (wrong password)', user)
			return false
		}

		// Create new token, random string
		return this.refresh_token(user)
	}
	save() {
		for(const user in this.accounts) this.db.set(user, this.accounts[user])
	}
	check_token(token) {
		if(!token) return false
		if(!this.tokens[token]) {
			console.debug('Unknown token', token)
			return false
		}
		if(Date.now() - this.tokens_reverse[this.tokens[token]].time > TOKEN_VALIDITY_LIMIT) {
			const user = this.tokens[token]
			delete this.tokens[token]
			delete this.tokens_reverse[user]
			console.debug('Expired token', token, user)
			return false
		}
		return this.tokens[token]
	}
	refresh_token(user) {
		user = user.trim().toLowerCase()

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
export { AccountManager }
