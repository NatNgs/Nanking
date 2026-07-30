import { getAccount } from '../repository/accountsRepository.js'
import { getUser } from '../repository/userRepository.js'
import { getSqlite } from '../data/db.js'

/**
 * Express middleware: requires an authenticated express-session
 * (`req.session.username`, set by the /login route). Loads the account and
 * user straight from SQLite for this request - no long-lived cache, so an
 * account deleted or revoked since the session was created is a real 401,
 * never a silently fabricated empty User (unlike the old lazy-create
 * getUser()).
 */
async function requireAuthentication(req, res, next) {
	const username = req.session?.username
	const sqlite = getSqlite()
	const account = username ? await getAccount(sqlite, username) : null
	if(!account || account.hash == null) {
		console.warn(req.originalUrl, '=> 401 (Unauthorized)')
		res.status(401).send('Unauthorized')
		return
	}
	req.user = await getUser(sqlite, username)
	req.user.displayLogin = account.displayLogin
	req.user.isAdmin = account.isAdmin
	next()
}

/**
 * Like requireAuthentication, but never blocks: attaches req.user only when
 * an authenticated session is present, otherwise lets the request through
 * anonymously. Used for routes that must stay publicly reachable but
 * personalize their response when the caller happens to be logged in.
 */
async function attachUserIfAuthenticated(req, res, next) {
	const username = req.session?.username
	if(!username) return next()

	const sqlite = getSqlite()
	const account = await getAccount(sqlite, username)
	if(!account || account.hash == null) return next()

	req.user = await getUser(sqlite, username)
	req.user.displayLogin = account.displayLogin
	req.user.isAdmin = account.isAdmin
	next()
}

export default requireAuthentication
export { attachUserIfAuthenticated }
