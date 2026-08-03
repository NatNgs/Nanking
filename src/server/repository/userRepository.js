import { User } from '../model/userModel.js'
import { DirectQuiz, DualQuiz } from '../model/quizModel.js'
import { getEntriesByIds } from './entriesRepository.js'

/**
 * Normalizes a DualQuiz's neg/pos to alphanumeric order, flipping value's
 * sign when reversed. A DualQuiz's neg/pos can be swapped and still refer to
 * the same pair (see DualQuiz.equals()), which the schema's
 * UNIQUE(username, neg_id, pos_id) constraint alone doesn't catch - this
 * normalization makes the constraint sufficient on its own, with no separate
 * lookup needed to detect the reversed duplicate.
 */
function normalizeDualQuiz(negId, posId, value) {
	return negId <= posId ? {negId, posId, value} : {negId: posId, posId: negId, value: -value}
}

/** True if a username has a real (non-ghost) account row. */
async function userExists(sqlite, username) {
	const row = await sqlite.get(
		'SELECT 1 FROM accounts WHERE username = ? AND password_hash IS NOT NULL', [username]
	)
	return !!row
}

/**
 * Loads `username`'s whole quiz history (direct_quiz + dual_quiz) for
 * `topicId`, merged back into a single chronological list via `ts` - the
 * single source of insertion order computeUserScores relies on. Every Entry
 * referenced by the history is resolved in one batched round-trip
 * (getEntriesByIds) rather than one lookup per quiz row.
 */
async function loadUserQuiz(sqlite, topicId, username) {
	const directRows = await sqlite.all(
		'SELECT entry_id AS entry, value, ts FROM direct_quiz WHERE topic_id = ? AND username = ?',
		[topicId, username]
	)
	const dualRows = await sqlite.all(
		'SELECT neg_id AS neg, pos_id AS pos, value, ts FROM dual_quiz WHERE topic_id = ? AND username = ?',
		[topicId, username]
	)
	const rows = [
		...directRows.map((r) => ({...r, type: 'direct'})),
		...dualRows.map((r) => ({...r, type: 'dual'})),
	].sort((a, b) => a.ts - b.ts)

	const entryIds = new Set()
	for(const row of rows) {
		if(row.type === 'direct') entryIds.add(row.entry)
		else { entryIds.add(row.neg); entryIds.add(row.pos) }
	}
	const entriesById = await getEntriesByIds(sqlite, topicId, [...entryIds])

	const quiz = []
	for(const row of rows) {
		let q
		if(row.type === 'direct') {
			const entry = entriesById.get(row.entry)
			// referenced entry no longer exists: skip, like the old loadQuiz()
			// implicitly did via getEntryById returning undefined
			if(!entry) continue
			q = new DirectQuiz(entry, +row.value)
		} else {
			const neg = entriesById.get(row.neg)
			const pos = entriesById.get(row.pos)
			if(!neg || !pos) continue
			q = new DualQuiz(neg, pos, +row.value)
		}
		q.ts = row.ts
		quiz.push(q)
	}
	return quiz
}

/**
 * Loads a user (account + full quiz history for `topicId`) at the demand of
 * a single request/cycle. Returns null if the account doesn't exist (or is a
 * ghost with no credentials yet) - callers must treat that as "not
 * authenticated", never silently fabricate an empty User (unlike the old
 * lazy-create getUser()).
 */
async function getUser(sqlite, topicId, username) {
	if(!await userExists(sqlite, username)) return null
	const user = new User(username)
	user.quiz = await loadUserQuiz(sqlite, topicId, username)
	return user
}

/**
 * True if any user still has a vote (direct or dual) referencing `entryId`
 * within `topicId` - a single SQL query, replacing the old scan of every
 * ALL_USERS' full quiz history.
 */
async function anyUserReferencesEntry(sqlite, topicId, entryId) {
	const row = await sqlite.get(`
		SELECT 1 FROM direct_quiz WHERE topic_id = ? AND entry_id = ?
		UNION
		SELECT 1 FROM dual_quiz WHERE topic_id = ? AND (neg_id = ? OR pos_id = ?)
		LIMIT 1
	`, [topicId, entryId, topicId, entryId, entryId])
	return !!row
}

/**
 * Removes every vote `username` made referencing `entryId` (either side of a
 * dual quiz) within `topicId`, used by entryService.deleteEntry() - mirrors
 * the old User.removeAllReferencesToEntry(), now applied directly in SQL
 * instead of requiring the user's full quiz history to already be loaded in
 * memory.
 */
async function removeUserReferencesToEntry(sqlite, topicId, username, entryId) {
	await sqlite.run(
		'DELETE FROM direct_quiz WHERE topic_id = ? AND username = ? AND entry_id = ?', [topicId, username, entryId]
	)
	await sqlite.run(
		'DELETE FROM dual_quiz WHERE topic_id = ? AND username = ? AND (neg_id = ? OR pos_id = ?)',
		[topicId, username, entryId, entryId]
	)
}

/**
 * Fully syncs SQLite's direct_quiz/dual_quiz rows for `user.username` within
 * `topicId` to user.quiz: any row missing from memory (removeQuiz() since the
 * last save) is deleted, every quiz still in memory is upserted with its `ts`
 * (see User.didQuiz()). DualQuiz neg/pos is normalized (see
 * normalizeDualQuiz()) before writing. Targeted to a single user/topic - safe
 * even though only that user's quiz (for that topic) is ever loaded at once.
 */
async function saveUser(sqlite, topicId, user) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		const directInMemory = new Map(
			user.quiz.filter((q) => q.type === 'direct').map((q) => [q.entry.id, q])
		)
		const dualInMemory = new Map(
			user.quiz.filter((q) => q.type === 'dual').map((q) => {
				const normalized = normalizeDualQuiz(q.neg.id, q.pos.id, q.value)
				return [normalized.negId + '|' + normalized.posId, {...normalized, ts: q.ts}]
			})
		)

		const existingDirect = db.prepare(
			'SELECT entry_id FROM direct_quiz WHERE topic_id = ? AND username = ?'
		).all(topicId, user.username)
		const deleteDirect = db.prepare('DELETE FROM direct_quiz WHERE topic_id = ? AND username = ? AND entry_id = ?')
		for(const {entry_id} of existingDirect) {
			if(!directInMemory.has(entry_id)) deleteDirect.run(topicId, user.username, entry_id)
		}
		const upsertDirect = db.prepare(
			'INSERT INTO direct_quiz (topic_id, username, entry_id, value, ts) VALUES (?, ?, ?, ?, ?) ' +
			'ON CONFLICT (username, topic_id, entry_id) DO UPDATE SET value = excluded.value, ts = excluded.ts'
		)
		for(const quiz of directInMemory.values()) {
			upsertDirect.run(topicId, user.username, quiz.entry.id, quiz.value, quiz.ts ?? Date.now())
		}

		const existingDual = db.prepare(
			'SELECT neg_id, pos_id FROM dual_quiz WHERE topic_id = ? AND username = ?'
		).all(topicId, user.username)
		const deleteDual = db.prepare(
			'DELETE FROM dual_quiz WHERE topic_id = ? AND username = ? AND neg_id = ? AND pos_id = ?'
		)
		for(const {neg_id, pos_id} of existingDual) {
			if(!dualInMemory.has(neg_id + '|' + pos_id)) deleteDual.run(topicId, user.username, neg_id, pos_id)
		}
		const upsertDual = db.prepare(
			'INSERT INTO dual_quiz (topic_id, username, neg_id, pos_id, value, ts) VALUES (?, ?, ?, ?, ?, ?) ' +
			'ON CONFLICT (username, topic_id, neg_id, pos_id) DO UPDATE SET value = excluded.value, ts = excluded.ts'
		)
		for(const {negId, posId, value, ts} of dualInMemory.values()) {
			upsertDual.run(topicId, user.username, negId, posId, value, ts ?? Date.now())
		}
	})
}

/** Every username with a real account, for the periodic score computation job. */
async function getAllUsernames(sqlite) {
	const rows = await sqlite.all('SELECT username FROM accounts WHERE password_hash IS NOT NULL')
	return rows.map((r) => r.username)
}

/**
 * Builds `username`'s dual-quiz history stats for the dual picker (see
 * dualQuizService.js), from a single lightweight query - unlike
 * loadUserQuiz(), this never resolves Entry objects, since only ids/counts
 * are needed here.
 *
 * Returns:
 * - `outgoing`: Map<entryId, Set<entryId>> - a DIRECTED graph, one edge per
 *   dual_quiz row: winner -> loser for a decisive vote (value != 0), and
 *   BOTH directions for a tie (value === 0, treated as transitive either
 *   way). Two decisive votes converging on a common opponent (A beats B, C
 *   beats B) never creates a path between A and C - that's the point: only
 *   chains that agree in direction count as "transitively compared".
 * - `dualCount`: Map<entryId, number> - how many dual_quiz rows reference
 *   this entry (as neg or pos), regardless of the result.
 * - `resultCounts`: Map<entryId, {W, L, E}> - wins/losses/ties for this
 *   entry. dual_quiz rows are already normalized (neg_id <= pos_id, value
 *   flipped accordingly - see normalizeDualQuiz()) but that normalization
 *   preserves the original semantics (value>0 favors pos_id, value<0 favors
 *   neg_id), so reading neg_id/pos_id/value as stored is enough: no
 *   denormalization needed.
 */
async function getUserDualStats(sqlite, topicId, username) {
	const rows = await sqlite.all(
		'SELECT neg_id AS neg, pos_id AS pos, value FROM dual_quiz WHERE topic_id = ? AND username = ?',
		[topicId, username]
	)

	const outgoing = new Map()
	const dualCount = new Map()
	const resultCounts = new Map()

	function addEdge(from, to) {
		if(!outgoing.has(from)) outgoing.set(from, new Set())
		outgoing.get(from).add(to)
	}
	function bumpCount(map, id, field) {
		const counts = map.get(id) ?? {W: 0, L: 0, E: 0}
		counts[field]++
		map.set(id, counts)
	}

	for(const {neg, pos, value} of rows) {
		dualCount.set(neg, (dualCount.get(neg) ?? 0) + 1)
		dualCount.set(pos, (dualCount.get(pos) ?? 0) + 1)

		if(value === 0) {
			addEdge(neg, pos)
			addEdge(pos, neg)
			bumpCount(resultCounts, neg, 'E')
			bumpCount(resultCounts, pos, 'E')
		} else if(value > 0) {
			addEdge(pos, neg)
			bumpCount(resultCounts, pos, 'W')
			bumpCount(resultCounts, neg, 'L')
		} else {
			addEdge(neg, pos)
			bumpCount(resultCounts, neg, 'W')
			bumpCount(resultCounts, pos, 'L')
		}
	}

	return {outgoing, dualCount, resultCounts}
}

export {
	getUser, userExists, anyUserReferencesEntry, removeUserReferencesToEntry,
	saveUser, getAllUsernames, normalizeDualQuiz, getUserDualStats,
}
