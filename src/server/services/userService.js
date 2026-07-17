/**
 * Serializes the current user's data for the HTTP response.
 */
function returnUserData(req, res) {
	res.json({username: req.user.displayLogin || req.user.username, user_scores: req.user.getUserList()})
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

export { returnUserData, setEntryScore }
