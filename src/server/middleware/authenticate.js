import ACCOUNTS from '../data/accounts.js'
import { getUser } from '../data/user.js'

/**
 * Express middleware: checks the authentication token sent in the `Authorization` header.
 * Refreshes the token (sliding session) and attaches the current user to `req.user`.
 */
function authenticate(req, res, next) {
	const token = req.headers.authorization
	const user = ACCOUNTS.check_token(token, req.ip)
	if(!user) {
		console.warn(req.originalUrl, '=> 401 (Unauthorized)')
		res.status(401).send('Unauthorized')
		return
	}
	const newToken = ACCOUNTS.refresh_token(user, req.ip, token)
	res.setHeader('authorization', newToken)
	req.user = getUser(user)
	req.user.displayLogin = ACCOUNTS.getDisplayLogin(user)
	next()
}

export default authenticate
