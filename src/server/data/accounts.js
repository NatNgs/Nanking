import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const USER_REGEX = /^[a-z0-9_.-]{4,20}$/

/**
 * Hashes the password (already hashed client-side) with the user's server-side salt.
 * The salt is never transmitted by the API: it never leaves the server.
 */
function hashWithSalt(pwd, salt) {
	return scryptSync(pwd, salt, 64).toString('hex')
}

class AccountManager {
	constructor() {
		this.accounts = {} // {user: {hash, salt, displayLogin}}
	}

	/**
	 * Registers `user`, or attaches credentials to an existing ghost account
	 * (imported quiz data with no credentials yet - see persistenceService.js's
	 * migration handling). Purely in-memory: callers that need this to land in
	 * SQLite before proceeding (e.g. before a direct_quiz row referencing this
	 * username, an FK dependency) must persist it themselves right after - see
	 * apiRoutes.js's registration flow.
	 */
	add(user, pwd) {
		if(!user || !pwd) return false

		// Check: username should match regex
		const displayLogin = user.trim()
		user = displayLogin.toLowerCase()
		if(!user.match(USER_REGEX)) return false

		// If account already exists (with real credentials), return false
		if(this.accounts[user]) return false

		const salt = randomBytes(16).toString('hex')
		this.accounts[user] = {hash: hashWithSalt(pwd, salt), salt, displayLogin}
		return true
	}

	/**
	 * Returns the login as the user originally typed it when creating the account
	 * (preserving case), falling back to the lookup key itself for accounts stored
	 * before this field existed.
	 */
	getDisplayLogin(user) {
		return this.accounts[user]?.displayLogin || user
	}
	/**
	 * Verifies credentials and returns the canonical (lowercased) username on
	 * success, or false otherwise. No longer issues any token: the caller
	 * (apiRoutes.js's /login) is responsible for establishing the
	 * express-session once this returns.
	 */
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

		return user
	}
	/**
	 * Checks a password against the stored hash without creating or refreshing
	 * any token, unlike login(). Used to re-confirm identity before a sensitive
	 * action (account deletion).
	 */
	verifyPassword(user, pwd) {
		if(!user || !pwd) return false
		user = user.trim().toLowerCase()
		if(!user.match(USER_REGEX)) return false

		const account = this.accounts[user]
		if(!account) return false

		const hash = hashWithSalt(pwd, account.salt)
		return timingSafeEqual(Buffer.from(hash), Buffer.from(account.hash))
	}
	/**
	 * Removes the account from memory. Purely in-memory: the caller
	 * (userService.js's deleteAccount()) is responsible for also destroying
	 * the user's express-session(s) and removing the persisted row - see
	 * persistenceService.js.
	 */
	remove(user) {
		if(!user) return false
		user = user.trim().toLowerCase()
		if(!this.accounts[user]) return false

		delete this.accounts[user]
		return true
	}
}

const ACCOUNTS = new AccountManager()
export default ACCOUNTS
export { AccountManager }
