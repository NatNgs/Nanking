import { getAccount, getDisplayLogin, removeAccount } from '../repository/accountsRepository.js'
import { getEntryById, getEntriesByIds } from '../repository/entriesRepository.js'
import { getUserScores } from '../repository/userEntryRepository.js'
import { paginate, compareBy } from '../lib/pagination.js'

/**
 * Enriches a serialized vote (toJson()) with the labels of the entries it
 * references, so the client no longer needs the full user_scores list to
 * display them (AccountPage "My inputs"). Mirrors resolveEntryTags in
 * tagService.js.
 */
async function enrichVoteWithLabels(sqlite, voteJson) {
	const label = async (entryId) => (await getEntryById(sqlite, entryId))?.name ?? null
	if(voteJson.type === 'direct') {
		return {...voteJson, entryLabel: await label(voteJson.entry)}
	}
	if(voteJson.type === 'dual') {
		return {...voteJson, negLabel: await label(voteJson.neg), posLabel: await label(voteJson.pos)}
	}
	return voteJson
}

/**
 * Serializes the current user's data for the HTTP response. Kept light:
 * neither user_scores (see GET /api/user/me/entities) nor the vote history
 * (see GET /api/user/me/quiz) - both are paginated separately. user.entries
 * reflects the last persisted computeUserScores() run (see
 * scoresComputerService's design notes) - loaded here rather than recomputed,
 * so scoredEntriesCount always matches user_entry as of the last recompute.
 */
async function returnUserData(sqlite, req, res) {
	req.user.entries = await getUserScores(sqlite, req.user.username)
	res.json({
		username: req.user.displayLogin || req.user.username,
		scoredEntriesCount: Object.keys(req.user.entries).length,
		isAdmin: !!req.user.isAdmin,
	})
}

/**
 * Paginated, newest-first vote history for the current user, backing
 * GET /api/user/me/quiz. `type` ('direct' | 'dual') optionally restricts to
 * one quiz kind, e.g. for the "recent inputs" mini-tables on NewEntryForm/DualQuiz.
 */
async function getUserQuizPaginated(sqlite, user, {type, page, limit} = {}) {
	const paginated = user.getQuizPaginated({type, page, limit})
	const items = []
	for(const item of paginated.items) items.push(await enrichVoteWithLabels(sqlite, item))
	return {...paginated, items}
}

/**
 * Paginated version of user.entries (raw computed scores, see
 * scoresComputerService.computeUserScores): sorts on the RAW user score
 * (min-max stretching is a monotonic function of the raw score, so sorting
 * before or after stretching gives the same order), slices the requested
 * page, and only THEN stretches the page's items and resolves their entry
 * label/image/globalScore in one batch — using the min/max computed over the
 * full entries set, never materializing the whole stretched list.
 */
async function paginateUserEntries(sqlite, userEntries, {sort, order, page, limit} = {}) {
	const rawEntries = Object.entries(userEntries) // [[entryId, rawScore], ...]
	const values = Object.values(userEntries)
	const minUserScore = Math.min(...values)
	const maxUserScore = Math.max(...values)
	const range = maxUserScore - minUserScore

	let entriesById
	if(sort === 'label' || sort === 'globalScore') {
		entriesById = await getEntriesByIds(sqlite, rawEntries.map(([id]) => id))
	}

	let sortKey
	if(sort === 'label') sortKey = ([id]) => entriesById.get(id)?.name
	else if(sort === 'globalScore') sortKey = ([id]) => entriesById.get(id)?.globalScore
	else sortKey = ([, rawScore]) => rawScore
	const defaultOrder = sort === 'label' ? 'asc' : 'desc'
	rawEntries.sort(compareBy(sortKey, order || defaultOrder))

	const {items, page: p, limit: l, total, hasMore} = paginate(rawEntries, {page, limit})

	const pageEntriesById = await getEntriesByIds(sqlite, items.map(([id]) => id))
	const stretchedItems = items.map(([entryId, rawScore]) => {
		const entry = pageEntriesById.get(entryId)
		return {
			id: entryId,
			label: entry?.name,
			image: entry?.image,
			score: range === 0 ? 0.5 : (rawScore - minUserScore) / range,
			globalScore: entry?.globalScore,
		}
	})

	return {items: stretchedItems, page: p, limit: l, total, hasMore}
}

/**
 * Paginated scores for the current user, backing GET /api/user/me/entities.
 * user.entries reflects the last persisted computeUserScores() run (see
 * scoresComputerService's design notes) - loaded here, never recomputed on
 * read.
 */
async function getUserEntities(sqlite, user, {sort, order, page, limit} = {}) {
	const scores = await getUserScores(sqlite, user.username)
	return paginateUserEntries(sqlite, scores, {sort, order, page, limit})
}

/**
 * Public profile data for `username`: paginated computed scores only (never
 * manual scores). Returns null if the account does not exist.
 */
async function getPublicUserData(sqlite, username, {sort, order, page, limit} = {}) {
	const lookupKey = username.trim().toLowerCase()
	const account = await getAccount(sqlite, lookupKey)
	if(!account || account.hash == null) return null

	const scores = await getUserScores(sqlite, lookupKey)
	const paginatedEntities = await paginateUserEntries(sqlite, scores, {sort, order, page, limit})
	return {username: await getDisplayLogin(sqlite, lookupKey), ...paginatedEntities}
}

/**
 * Permanently deletes an account and all of its user data (cascades to
 * direct_quiz/dual_quiz via SQLite's ON DELETE CASCADE).
 */
async function deleteAccount(sqlite, username) {
	await removeAccount(sqlite, username.trim().toLowerCase())
}

export { returnUserData, getPublicUserData as returnPublicUserData, getUserEntities, getUserQuizPaginated, deleteAccount }
