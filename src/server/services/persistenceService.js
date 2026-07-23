import ENTRIES from '../data/entries.js'
import TAGS from '../data/tags.js'
import ACCOUNTS from '../data/accounts.js'
import { ALL_USERS, User } from '../data/user.js'
import { Entry } from '../data/entries.js'
import { Tag } from '../data/tags.js'
import { loadQuiz } from '../data/quiz.js'

/**
 * Translates between the in-memory model (ENTRIES, TAGS, ACCOUNTS, ALL_USERS -
 * plain data containers, no SQLite awareness of their own - see entries.js,
 * tags.js, accounts.js, user.js) and the SQLite tables backing them (see
 * sqliteDb.js's schema). Every read/write of the persisted state goes through
 * here, so the data classes stay simple and independently testable.
 *
 * The SqliteConnection itself is never opened here or at module scope:
 * server.js opens it explicitly (see sqliteDb.js's openSqlite()) and passes
 * it to init() below before anything else in this module is called. This
 * keeps merely importing this module (or entries.js/tags.js/etc.) free of
 * any side effect on the real SQLite file - only server.js's own explicit
 * open touches disk.
 */
let sqlite = null
function init(sqliteConnection) {
	sqlite = sqliteConnection
}

/**
 * Normalizes a DualQuiz's neg/pos to alphanumeric order, flipping value's
 * sign when reversed. A DualQuiz's neg/pos can be swapped and still refer to
 * the same pair (see DualQuiz.equals()), which the schema's
 * UNIQUE(username, neg_id, pos_id) constraint alone doesn't catch - this
 * normalization makes the constraint sufficient on its own, with no separate
 * lookup needed to detect the reversed duplicate. Shared by saveUser() and
 * migrateFromJson.js, which must agree on the same convention.
 */
function normalizeDualQuiz(negId, posId, value) {
	return negId <= posId ? {negId, posId, value} : {negId: posId, posId: negId, value: -value}
}

/**
 * Loads every entry (and its tag links) from SQLite into ENTRIES. Called once
 * at startup, before TAGS/ACCOUNTS/users (see loadAll() and server.js).
 */
async function loadEntries() {
	const rows = await sqlite.all('SELECT id, name, image FROM entries')
	const tagLinks = await sqlite.all('SELECT entry_id, tag_id FROM entry_tags')
	const tagsByEntry = {}
	for(const {entry_id, tag_id} of tagLinks) {
		(tagsByEntry[entry_id] ??= []).push(tag_id)
	}

	for(const row of rows) {
		try {
			const entry = new Entry(row.id, row.name)
			if(row.image) entry.image = row.image
			entry.tags = tagsByEntry[row.id] || []
			ENTRIES.entries[row.id] = entry
		} catch(err) {
			console.error(`Impossible de charger l'entry '${row.id}' :`, err.message)
		}
	}
}

/**
 * Fully syncs SQLite's `entries`/`entry_tags` tables to ENTRIES.entries: any
 * row not present in memory (deleteEntry() since the last save) is removed,
 * every entry still in memory is upserted.
 */
async function saveEntries() {
	await sqlite.transaction(() => {
		const db = sqlite.db
		const keptIds = Object.keys(ENTRIES.entries)

		const existingIds = db.prepare('SELECT id FROM entries').all().map((r) => r.id)
		const deleteEntry = db.prepare('DELETE FROM entries WHERE id = ?')
		for(const id of existingIds) {
			if(!ENTRIES.entries[id]) deleteEntry.run(id)
		}

		const upsertEntry = db.prepare(
			'INSERT INTO entries (id, name, image) VALUES (?, ?, ?) ' +
			'ON CONFLICT (id) DO UPDATE SET name = excluded.name, image = excluded.image'
		)
		const deleteEntryTags = db.prepare('DELETE FROM entry_tags WHERE entry_id = ?')
		const insertEntryTag = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)')
		for(const id of keptIds) {
			const entry = ENTRIES.entries[id]
			upsertEntry.run(entry.id, entry.name, entry.image)
			deleteEntryTags.run(entry.id)
			for(const tagId of entry.tags) insertEntryTag.run(entry.id, tagId)
		}
	})
}

/**
 * Loads every tag (and its parent links) from SQLite into TAGS. Called once
 * at startup, after loadEntries() - see loadAll().
 */
async function loadTags() {
	const rows = await sqlite.all('SELECT id, label FROM tags')
	const parentLinks = await sqlite.all('SELECT tag_id, parent_id FROM tag_parents')
	const parentsByTag = {}
	for(const {tag_id, parent_id} of parentLinks) {
		(parentsByTag[tag_id] ??= []).push(parent_id)
	}

	for(const row of rows) {
		try {
			const tag = new Tag(row.id, row.label)
			tag.parents = parentsByTag[row.id] || []
			TAGS.tags[row.id] = tag
		} catch(err) {
			console.error(`Impossible de charger le tag '${row.id}' :`, err.message)
		}
	}
	// Second pass: drop any parent id that ended up not loading (invalid id,
	// corrupted entry, ...), so `parents` never points into the void.
	for(const tagId in TAGS.tags) {
		TAGS.tags[tagId].parents = TAGS.tags[tagId].parents.filter((parentId) => TAGS.tags[parentId])
	}
}

/**
 * Fully syncs SQLite's `tags`/`tag_parents` tables to TAGS.tags, pruning
 * orphan tags along the way (see TagsManager.pruneOrphanTagIds()): any row
 * not present in memory OR now orphan is removed, every other tag still in
 * memory is upserted.
 */
async function saveTags() {
	const prunedIds = new Set(TAGS.pruneOrphanTagIds())

	await sqlite.transaction(() => {
		const db = sqlite.db
		const keptIds = Object.keys(TAGS.tags).filter((id) => !prunedIds.has(id))

		const existingIds = db.prepare('SELECT id FROM tags').all().map((r) => r.id)
		const deleteTag = db.prepare('DELETE FROM tags WHERE id = ?')
		for(const id of existingIds) {
			if(!TAGS.tags[id] || prunedIds.has(id)) deleteTag.run(id)
		}

		const upsertTag = db.prepare(
			'INSERT INTO tags (id, label) VALUES (?, ?) ' +
			'ON CONFLICT (id) DO UPDATE SET label = excluded.label'
		)
		const deleteTagParents = db.prepare('DELETE FROM tag_parents WHERE tag_id = ?')
		const insertTagParent = db.prepare('INSERT OR IGNORE INTO tag_parents (tag_id, parent_id) VALUES (?, ?)')
		for(const id of keptIds) {
			const tag = TAGS.tags[id]
			upsertTag.run(tag.id, tag.label)
			deleteTagParents.run(tag.id)
			for(const parentId of tag.parents) {
				if(!prunedIds.has(parentId)) insertTagParent.run(tag.id, parentId)
			}
		}
	})
}

/**
 * Loads every account from SQLite into ACCOUNTS, and every still-valid
 * session (see `sessions` table) so tokens survive a server restart. Called
 * once at startup, after loadTags() - see loadAll().
 */
async function loadAccounts() {
	const rows = await sqlite.all('SELECT username, display_login, password_hash, salt FROM accounts')
	for(const row of rows) {
		// A ghost account (imported quiz data, no credentials yet - see
		// migrateFromJson.js) has NULL hash/salt: skip it here so
		// ACCOUNTS.accounts[user] stays falsy, exactly like "not registered",
		// until add()/persistAccount() gives it real credentials.
		if(row.password_hash == null) continue
		ACCOUNTS.accounts[row.username] = {hash: row.password_hash, salt: row.salt, displayLogin: row.display_login}
	}

	const sessions = await sqlite.all('SELECT token_ip_hash, username, issued_at FROM sessions')
	for(const session of sessions) {
		ACCOUNTS.tokens[session.token_ip_hash] = session.username
		ACCOUNTS.tokens_reverse[session.username] = {hash: session.token_ip_hash, time: session.issued_at}
	}
}

/**
 * Upserts a single account row immediately - used right after ACCOUNTS.add(),
 * which must land in SQLite before any direct_quiz/dual_quiz row can
 * reference this username (FK constraint), so it can't wait for a later,
 * batched saveAccounts() - see apiRoutes.js's registration flow.
 */
async function persistAccount(username) {
	const account = ACCOUNTS.accounts[username]
	await sqlite.run(
		'INSERT INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, ?, ?) ' +
		'ON CONFLICT (username) DO UPDATE SET display_login = excluded.display_login, password_hash = excluded.password_hash, salt = excluded.salt',
		[username, account.displayLogin, account.hash, account.salt]
	)
}

/**
 * Fully syncs SQLite's `accounts` table to ACCOUNTS.accounts: only ever
 * upserts (never deletes a row missing from memory - deleteAccount() below
 * already handles deletion directly and immediately).
 */
async function saveAccounts() {
	await sqlite.transaction(() => {
		const db = sqlite.db
		const upsertAccount = db.prepare(
			'INSERT INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, ?, ?) ' +
			'ON CONFLICT (username) DO UPDATE SET display_login = excluded.display_login, password_hash = excluded.password_hash, salt = excluded.salt'
		)
		for(const user in ACCOUNTS.accounts) {
			const account = ACCOUNTS.accounts[user]
			upsertAccount.run(user, account.displayLogin, account.hash, account.salt)
		}
	})
}

/**
 * Permanently deletes an account's SQLite row, cascading (ON DELETE CASCADE
 * - see sqliteDb.js's schema) to its sessions/direct_quiz/dual_quiz rows.
 * Called by userService.js's deleteAccount(), after ACCOUNTS.remove() has
 * already cleared the in-memory state.
 */
async function deleteAccount(username) {
	await sqlite.run('DELETE FROM accounts WHERE username = ?', [username])
}

/**
 * Persists a token refresh/expiry to the `sessions` table, fire-and-forget
 * from the caller's perspective (authenticate.js's middleware stays
 * synchronous) - mirrors ACCOUNTS.refresh_token()'s in-memory bookkeeping.
 */
async function persistTokenRefresh(user, hash, issuedAt, previousHash) {
	await sqlite.transaction(() => {
		const db = sqlite.db
		if(previousHash) db.prepare('DELETE FROM sessions WHERE token_ip_hash = ?').run(previousHash)
		db.prepare(
			'INSERT INTO sessions (token_ip_hash, username, issued_at) VALUES (?, ?, ?) ' +
			'ON CONFLICT (token_ip_hash) DO UPDATE SET username = excluded.username, issued_at = excluded.issued_at'
		).run(hash, user, issuedAt)
	})
}

/**
 * Removes an expired token's row from the `sessions` table, fire-and-forget -
 * mirrors ACCOUNTS.check_token()'s in-memory cleanup on expiry.
 */
async function deleteSession(hash) {
	await sqlite.run('DELETE FROM sessions WHERE token_ip_hash = ?', [hash])
}

/**
 * Loads a single user's whole quiz history from SQLite (direct_quiz +
 * dual_quiz, see sqliteDb.js's schema), merged back into a single
 * chronological list via `ts` - the single source of insertion order
 * this.quiz relies on for computeUserScores.
 */
async function loadUserQuiz(user) {
	const directRows = await sqlite.all(
		'SELECT entry_id AS entry, value, ts FROM direct_quiz WHERE username = ?', [user.username]
	)
	const dualRows = await sqlite.all(
		'SELECT neg_id AS neg, pos_id AS pos, value, ts FROM dual_quiz WHERE username = ?', [user.username]
	)
	const rows = [
		...directRows.map((r) => ({...r, type: 'direct'})),
		...dualRows.map((r) => ({...r, type: 'dual'})),
	].sort((a, b) => a.ts - b.ts)

	user.quiz = rows.map((row) => loadQuiz(row)).filter(Boolean)
}

/**
 * Loads every account's User (see accounts table) into ALL_USERS, each with
 * its full quiz history - see loadUserQuiz(). Called once at startup, after
 * loadAccounts() - see loadAll().
 */
async function loadAllUsers() {
	const usernames = (await sqlite.all('SELECT username FROM accounts')).map((r) => r.username)
	for(const username of usernames) {
		const user = new User(username)
		await loadUserQuiz(user)
		ALL_USERS[username] = user
	}
}

/**
 * Fully syncs SQLite's direct_quiz/dual_quiz rows for `user.username` to
 * user.quiz: any row missing from memory (removeQuiz()/
 * removeAllReferencesToEntry() since the last save) is deleted, every quiz
 * still in memory is upserted with its `ts` (see User.didQuiz()). DualQuiz
 * neg/pos is normalized (see normalizeDualQuiz()) before writing.
 */
async function saveUser(user) {
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

		const existingDirect = db.prepare('SELECT entry_id FROM direct_quiz WHERE username = ?').all(user.username)
		const deleteDirect = db.prepare('DELETE FROM direct_quiz WHERE username = ? AND entry_id = ?')
		for(const {entry_id} of existingDirect) {
			if(!directInMemory.has(entry_id)) deleteDirect.run(user.username, entry_id)
		}
		const upsertDirect = db.prepare(
			'INSERT INTO direct_quiz (username, entry_id, value, ts) VALUES (?, ?, ?, ?) ' +
			'ON CONFLICT (username, entry_id) DO UPDATE SET value = excluded.value, ts = excluded.ts'
		)
		for(const quiz of directInMemory.values()) {
			upsertDirect.run(user.username, quiz.entry.id, quiz.value, quiz.ts ?? Date.now())
		}

		const existingDual = db.prepare('SELECT neg_id, pos_id FROM dual_quiz WHERE username = ?').all(user.username)
		const deleteDual = db.prepare('DELETE FROM dual_quiz WHERE username = ? AND neg_id = ? AND pos_id = ?')
		for(const {neg_id, pos_id} of existingDual) {
			if(!dualInMemory.has(neg_id + '|' + pos_id)) deleteDual.run(user.username, neg_id, pos_id)
		}
		const upsertDual = db.prepare(
			'INSERT INTO dual_quiz (username, neg_id, pos_id, value, ts) VALUES (?, ?, ?, ?, ?) ' +
			'ON CONFLICT (username, neg_id, pos_id) DO UPDATE SET value = excluded.value, ts = excluded.ts'
		)
		for(const {negId, posId, value, ts} of dualInMemory.values()) {
			upsertDual.run(user.username, negId, posId, value, ts ?? Date.now())
		}
	})
}

function saveAllUsers() {
	return Promise.all(Object.values(ALL_USERS).map((user) => saveUser(user)))
}

/**
 * Loads all persisted state from SQLite into the in-memory singletons, in
 * dependency order: entries before tags (tags reference entry usage when
 * pruning), accounts before users (users are enumerated from account rows).
 * Called once at server startup - see server.js.
 */
async function loadAll() {
	await loadEntries()
	await loadTags()
	await loadAccounts()
	await loadAllUsers()
}

export {
	init, loadAll, loadEntries, loadTags, loadAccounts, loadAllUsers, loadUserQuiz,
	saveEntries, saveTags, saveAccounts, saveUser, saveAllUsers,
	persistAccount, deleteAccount, persistTokenRefresh, deleteSession,
	normalizeDualQuiz,
}
