import { scryptSync } from 'node:crypto'

const USER_REGEX = /^[a-z0-9_.-]{4,20}$/

/**
 * Hashes the password (already hashed client-side) with the user's server-side salt.
 * The salt is never transmitted by the API: it never leaves the server.
 */
function hashWithSalt(pwd, salt) {
	return scryptSync(pwd, salt, 64).toString('hex')
}

export { hashWithSalt, USER_REGEX }
