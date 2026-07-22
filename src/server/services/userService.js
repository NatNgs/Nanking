import ACCOUNTS from '../data/accounts.js'
import { getUser, deleteUser } from '../data/user.js'
import ENTRIES from '../data/entries.js'

/**
 * Enriches a serialized vote (toJson()) with the labels of the entries it
 * references, so the client no longer needs the full user_scores list to
 * display them (AccountPage "My inputs"). Mirrors resolveEntryTags in
 * tagService.js.
 */
function enrichVoteWithLabels(voteJson) {
	const label = (entryId) => ENTRIES.getEntryById(entryId)?.name ?? null
	if(voteJson.type === 'default') {
		return {...voteJson, entryLabel: label(voteJson.entry)}
	}
	if(voteJson.type === 'dual') {
		return {...voteJson, negLabel: label(voteJson.neg), posLabel: label(voteJson.pos)}
	}
	return voteJson
}

/**
 * Serializes the current user's data for the HTTP response. Kept light:
 * neither user_scores (see GET /api/user/me/entities) nor the vote history
 * (see GET /api/user/me/quiz) - both are paginated separately.
 */
function returnUserData(req, res) {
	res.json({
		username: req.user.displayLogin || req.user.username,
		scoredEntriesCount: Object.keys(req.user.entries).length,
	})
}

/**
 * Paginated, newest-first vote history for the current user, backing
 * GET /api/user/me/quiz. `type` ('default' | 'dual') optionally restricts to
 * one quiz kind, e.g. for the "recent inputs" mini-tables on NewEntryForm/DualQuiz.
 */
function getUserQuizPaginated(user, {type, page, limit} = {}) {
	const paginated = user.getQuizPaginated({type, page, limit})
	return {...paginated, items: paginated.items.map(enrichVoteWithLabels)}
}

/**
 * Paginated scores for the current user, backing GET /api/user/me/entities.
 */
function getUserEntities(user, {sort, order, page, limit} = {}) {
	return user.getUserListPaginated({sort, order, page, limit})
}

/**
 * Public profile data for `username`: paginated computed scores only (never
 * manual scores). Returns null if the account does not exist.
 */
function getPublicUserData(username, {sort, order, page, limit} = {}) {
	const lookupKey = username.trim().toLowerCase()
	if(!ACCOUNTS.accounts[lookupKey]) return null

	const user = getUser(lookupKey)
	const paginatedEntities = user.getUserListPaginated({sort, order, page, limit})
	return {username: ACCOUNTS.getDisplayLogin(lookupKey), ...paginatedEntities}
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

export { returnUserData, setEntryScore, getPublicUserData as returnPublicUserData, getUserEntities, getUserQuizPaginated, deleteAccount }
