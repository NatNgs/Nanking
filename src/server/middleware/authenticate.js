import ACCOUNTS, { hashTokenIp } from '../data/accounts.js'
import { getUser } from '../data/user.js'
import { persistTokenRefresh } from '../services/persistenceService.js'

/**
 * Persists a session refresh to the `sessions` table (fire-and-forget, like
 * every other manager's writes), but only when refresh_token() actually
 * issued a new token - not on every request, since most calls just reuse the
 * still-fresh existing one (see AccountManager.refresh_token()'s own
 * TOKEN_REFRESH_RATE check).
 */
function persistIfRefreshed(user, oldToken, newToken, ip) {
	if(newToken === oldToken) return
	const tokenInfo = ACCOUNTS.tokens_reverse[user]
	const previousHash = oldToken ? hashTokenIp(oldToken, ip) : null
	persistTokenRefresh(user, tokenInfo.hash, tokenInfo.time, previousHash)
		.catch((err) => console.error('persistTokenRefresh() failed:', err))
}

/**
 * Express middleware: checks the authentication token sent in the `Authorization` header.
 * Refreshes the token (sliding session) and attaches the current user to `req.user`.
 */
function requireAuthentication(req, res, next) {
	const token = req.headers.authorization
	const user = ACCOUNTS.check_token(token, req.ip)
	if(!user) {
		console.warn(req.originalUrl, '=> 401 (Unauthorized)')
		res.status(401).send('Unauthorized')
		return
	}
	const newToken = ACCOUNTS.refresh_token(user, req.ip, token)
	persistIfRefreshed(user, token, newToken, req.ip)
	res.setHeader('authorization', newToken)
	req.user = getUser(user)
	req.user.displayLogin = ACCOUNTS.getDisplayLogin(user)
	next()
}

/**
 * Like requireAuthentication, but never blocks: attaches req.user only when
 * a valid token is present, otherwise lets the request through anonymously.
 * Used for routes that must stay publicly reachable but personalize their
 * response when the caller happens to be logged in.
 */
function attachUserIfAuthenticated(req, res, next) {
	const token = req.headers.authorization
	if(!token) return next()

	const user = ACCOUNTS.check_token(token, req.ip)
	if(!user) return next()

	const newToken = ACCOUNTS.refresh_token(user, req.ip, token)
	persistIfRefreshed(user, token, newToken, req.ip)
	res.setHeader('authorization', newToken)
	req.user = getUser(user)
	req.user.displayLogin = ACCOUNTS.getDisplayLogin(user)
	next()
}

export default requireAuthentication
export { attachUserIfAuthenticated }
