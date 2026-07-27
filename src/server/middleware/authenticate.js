import ACCOUNTS from '../data/accounts.js'
import { getUser } from '../data/user.js'

/**
 * Express middleware: requires an authenticated express-session
 * (`req.session.username`, set by the /login route). Attaches the current
 * user to `req.user`.
 */
function requireAuthentication(req, res, next) {
	const username = req.session?.username
	if(!username || !ACCOUNTS.accounts[username]) {
		console.warn(req.originalUrl, '=> 401 (Unauthorized)')
		res.status(401).send('Unauthorized')
		return
	}
	req.user = getUser(username)
	req.user.displayLogin = ACCOUNTS.getDisplayLogin(username)
	next()
}

/**
 * Like requireAuthentication, but never blocks: attaches req.user only when
 * an authenticated session is present, otherwise lets the request through
 * anonymously. Used for routes that must stay publicly reachable but
 * personalize their response when the caller happens to be logged in.
 */
function attachUserIfAuthenticated(req, res, next) {
	const username = req.session?.username
	if(!username || !ACCOUNTS.accounts[username]) return next()

	req.user = getUser(username)
	req.user.displayLogin = ACCOUNTS.getDisplayLogin(username)
	next()
}

export default requireAuthentication
export { attachUserIfAuthenticated }
