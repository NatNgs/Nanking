/**
 * Loads `username`'s last known personal score on every entry it has voted
 * on - the persisted result of the last computeUserScores() run for this
 * user (right after a quiz mutation, or during the global cycle), never
 * recomputed on read.
 */
async function getUserScores(sqlite, username) {
	const rows = await sqlite.all('SELECT entry_id, score FROM user_entry WHERE username = ?', [username])
	const scores = {}
	for(const row of rows) scores[row.entry_id] = row.score
	return scores
}

/**
 * Fully resyncs `username`'s user_entry rows to `scores` ({entryId: score}):
 * any row for an entry no longer in `scores` (its last vote was just
 * removed) is deleted, every entry in `scores` is upserted - mirrors
 * tagsRepository.saveTag()'s resync of tag_parents.
 */
async function saveUserScores(sqlite, username, scores) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		const entryIds = Object.keys(scores)
		if(entryIds.length) {
			const placeholders = entryIds.map(() => '?').join(',')
			db.prepare(
				`DELETE FROM user_entry WHERE username = ? AND entry_id NOT IN (${placeholders})`
			).run(username, ...entryIds)
		} else {
			db.prepare('DELETE FROM user_entry WHERE username = ?').run(username)
		}
		const upsert = db.prepare(
			'INSERT INTO user_entry (username, entry_id, score) VALUES (?, ?, ?) ' +
			'ON CONFLICT (username, entry_id) DO UPDATE SET score = excluded.score'
		)
		for(const entryId of entryIds) upsert.run(username, entryId, scores[entryId])
	})
}

/** Every user's personal score on `entryId`, for computeGlobalScores(). */
async function getScoresForEntry(sqlite, entryId) {
	const rows = await sqlite.all('SELECT username, score FROM user_entry WHERE entry_id = ?', [entryId])
	const scores = {}
	for(const row of rows) scores[row.username] = row.score
	return scores
}

export { getUserScores, saveUserScores, getScoresForEntry }
