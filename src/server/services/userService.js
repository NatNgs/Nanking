import ACCOUNTS from '../data/accounts.js'
import { getUser, deleteUser } from '../data/user.js'

/**
 * Serializes the current user's data for the HTTP response.
 */
function returnUserData(req, res) {
	res.json({username: req.user.displayLogin || req.user.username, user_scores: req.user.getUserList()})
}

/**
 * Public profile data for `username`: computed scores only (never manual
 * scores). Returns null if the account does not exist.
 */
function returnPublicUserData(username) {
	const lookupKey = username.trim().toLowerCase()
	if(!ACCOUNTS.accounts[lookupKey]) return null

	const user = getUser(lookupKey)
	const scores = user.getUserList().map(({id, label, image, cur}) => ({id, label, image, cur}))
	return {username: ACCOUNTS.getDisplayLogin(lookupKey), user_scores: scores}
}

/**
 * Permanently deletes an account and all of its user data.
 */
function deleteAccount(username) {
	ACCOUNTS.remove(username)
	deleteUser(username.trim().toLowerCase())
}

/**
 * Validates then applies a manual score on an entry for the current user.
 * @returns {boolean} true if the score was applied, false if invalid (expected between 0 and 1)
 */
function setEntryScore(user, entryName, score) {
	if(score < 0 || score > 1) return false

	user.setEntryScore(entryName, score)
	return true
}

export { returnUserData, setEntryScore, returnPublicUserData, deleteAccount }
