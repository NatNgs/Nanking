import { randomBytes, timingSafeEqual } from 'node:crypto'
import { hashWithSalt, USER_REGEX } from '../model/accountsModel.js'

/** Returns {username, displayLogin, hash, salt, isAdmin}, or null if unknown. */
async function getAccount(sqlite, username) {
	const row = await sqlite.get(
		'SELECT username, display_login, password_hash, salt, is_admin FROM accounts WHERE username = ?',
		[username]
	)
	if(!row) return null
	return {
		username: row.username, displayLogin: row.display_login,
		hash: row.password_hash, salt: row.salt, isAdmin: !!row.is_admin,
	}
}

/**
 * Registers `user`, or attaches credentials to an existing ghost account
 * (quiz data with no credentials yet, password_hash IS NULL). Returns true on
 * success, false if the login is invalid/missing or an account with real
 * credentials already exists.
 */
async function addAccount(sqlite, user, pwd) {
	if(!user || !pwd) return false

	const displayLogin = user.trim()
	user = displayLogin.toLowerCase()
	if(!user.match(USER_REGEX)) return false

	const existing = await getAccount(sqlite, user)
	if(existing?.hash != null) return false // already registered, real credentials

	const salt = randomBytes(16).toString('hex')
	const hash = hashWithSalt(pwd, salt)
	await sqlite.run(
		'INSERT INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, ?, ?) ' +
		'ON CONFLICT (username) DO UPDATE SET display_login = excluded.display_login, ' +
		'password_hash = excluded.password_hash, salt = excluded.salt',
		[user, displayLogin, hash, salt]
	)
	return true
}

/**
 * Returns the login as the user originally typed it when creating the
 * account (preserving case), falling back to the lookup key itself if the
 * account is unknown.
 */
async function getDisplayLogin(sqlite, username) {
	const account = await getAccount(sqlite, username)
	return account?.displayLogin || username
}

/**
 * True if `username` has the Admin flag set. Never settable from the
 * application itself - see README's "Database access" section for how to
 * grant it directly in SQLite.
 */
async function isAdmin(sqlite, username) {
	const account = await getAccount(sqlite, username)
	return !!account?.isAdmin
}

/**
 * Verifies credentials and returns the canonical (lowercased) username on
 * success, or false otherwise. Issues no token/session - the caller
 * (apiRoutes.js's /login) establishes the express-session once this returns.
 */
async function login(sqlite, user, pwd) {
	if(!user || !pwd) return false

	user = user.trim().toLowerCase()
	if(!user.match(USER_REGEX)) return false

	const account = await getAccount(sqlite, user)
	if(account?.hash == null) {
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
 * Checks a password against the stored hash without creating any session,
 * unlike login(). Used to re-confirm identity before a sensitive action
 * (account deletion).
 */
async function verifyPassword(sqlite, user, pwd) {
	if(!user || !pwd) return false
	user = user.trim().toLowerCase()
	if(!user.match(USER_REGEX)) return false

	const account = await getAccount(sqlite, user)
	if(account?.hash == null) return false

	const hash = hashWithSalt(pwd, account.salt)
	return timingSafeEqual(Buffer.from(hash), Buffer.from(account.hash))
}

/**
 * Permanently deletes the account row, cascading (ON DELETE CASCADE - see
 * sqliteDb.js's schema) to its direct_quiz/dual_quiz rows.
 */
async function removeAccount(sqlite, username) {
	if(!username) return false
	username = username.trim().toLowerCase()
	const existing = await getAccount(sqlite, username)
	if(!existing) return false
	await sqlite.run('DELETE FROM accounts WHERE username = ?', [username])
	return true
}

export { getAccount, addAccount, getDisplayLogin, isAdmin, login, verifyPassword, removeAccount }
