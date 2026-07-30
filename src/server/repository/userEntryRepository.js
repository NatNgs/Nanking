/**
 * Loads `username`'s last known personal score on every entry it has voted
 * on within `topicId` - the persisted result of the last computeUserScores()
 * run for this user (right after a quiz mutation, or during the global
 * cycle), never recomputed on read.
 */
async function getUserScores(sqlite, topicId, username) {
	const rows = await sqlite.all(
		'SELECT entry_id, score FROM user_entry WHERE topic_id = ? AND username = ?', [topicId, username]
	)
	const scores = {}
	for(const row of rows) scores[row.entry_id] = row.score
	return scores
}

/**
 * Fully resyncs `username`'s user_entry rows within `topicId` to `scores`
 * ({entryId: score}): any row for an entry no longer in `scores` (its last
 * vote was just removed) is deleted, every entry in `scores` is upserted -
 * mirrors tagsRepository.saveTag()'s resync of tag_parents. Scoped to
 * `topicId` so this never touches the same user's scores in another topic.
 */
async function saveUserScores(sqlite, topicId, username, scores) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		const entryIds = Object.keys(scores)
		if(entryIds.length) {
			const placeholders = entryIds.map(() => '?').join(',')
			db.prepare(
				`DELETE FROM user_entry WHERE topic_id = ? AND username = ? AND entry_id NOT IN (${placeholders})`
			).run(topicId, username, ...entryIds)
		} else {
			db.prepare('DELETE FROM user_entry WHERE topic_id = ? AND username = ?').run(topicId, username)
		}
		const upsert = db.prepare(
			'INSERT INTO user_entry (topic_id, username, entry_id, score) VALUES (?, ?, ?, ?) ' +
			'ON CONFLICT (username, topic_id, entry_id) DO UPDATE SET score = excluded.score'
		)
		for(const entryId of entryIds) upsert.run(topicId, username, entryId, scores[entryId])
	})
}

/** Every user's personal score on `entryId` within `topicId`, for computeGlobalScores(). */
async function getScoresForEntry(sqlite, topicId, entryId) {
	const rows = await sqlite.all(
		'SELECT username, score FROM user_entry WHERE topic_id = ? AND entry_id = ?', [topicId, entryId]
	)
	const scores = {}
	for(const row of rows) scores[row.username] = row.score
	return scores
}

export { getUserScores, saveUserScores, getScoresForEntry }
