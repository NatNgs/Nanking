import DB from './db.js'
import { v4 as uuidv4 } from 'uuid'
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
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

/**
 * Hashes a (token, ip) pair for in-memory storage. The raw token/IP are never
 * kept in memory past this point: only this hash is stored, so that a memory
 * dump does not expose directly reusable session tokens or IP addresses.
 */
function hashTokenIp(token, ip) {
	return createHash('sha256').update(token + '|' + ip).digest('hex')
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
	login(user, pwd, ip) {
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
		return this.refresh_token(user, ip, null)
	}
	save() {
		for(const user in this.accounts) this.db.set(user, this.accounts[user])
	}
	/**
	 * Validates a token, and checks that it is being used from the same IP address
	 * it was issued/refreshed on. Neither the raw token nor the IP are ever kept in
	 * memory: only hash(token, ip) is stored, so a memory dump exposes nothing directly
	 * reusable. Never persisted to disk: the binding resets on restart.
	 */
	check_token(token, ip) {
		if(!token) return false
		const hash = hashTokenIp(token, ip)
		const user = this.tokens[hash]
		if(!user) {
			console.debug('Unknown token (or IP mismatch)')
			return false
		}
		const tokenInfo = this.tokens_reverse[user]
		if(Date.now() - tokenInfo.time > TOKEN_VALIDITY_LIMIT) {
			delete this.tokens[hash]
			delete this.tokens_reverse[user]
			console.debug('Expired token', user)
			return false
		}
		return user
	}
	/**
	 * Refreshes (or creates) the session token for `user`, bound to `ip`.
	 * `currentToken` is the token the caller already validated on this request (if any):
	 * when the existing binding is still fresh enough, it is returned as-is instead of
	 * generating a new one, since the caller already knows it — no need to keep the raw
	 * token in memory to "give it back" later.
	 */
	refresh_token(user, ip, currentToken) {
		user = user.trim().toLowerCase()

		// If the current token is still bound to this exact (token, ip) pair and is not
		// older than TOKEN_REFRESH_RATE, return it without refresh
		const current = this.tokens_reverse[user]
		if(current && currentToken
		&& current.hash === hashTokenIp(currentToken, ip)
		&& Date.now() - current.time < TOKEN_REFRESH_RATE) {
			return currentToken
		}

		// Do refresh the token
		const token = uuidv4()
		if(current) delete this.tokens[current.hash]

		const hash = hashTokenIp(token, ip)
		this.tokens[hash] = user
		this.tokens_reverse[user] = {hash, time: Date.now()}
		return token
	}
}

const ACCOUNTS = new AccountManager(DB)
export default ACCOUNTS
export { AccountManager }
