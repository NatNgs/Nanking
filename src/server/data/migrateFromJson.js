import { readFileSync, existsSync, renameSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import CONFIG from '../config/config.js'
import { seedIdSequences } from './sqliteDb.js'

/**
 * One-shot compatibility import: reads the legacy gzip-compressed JSON
 * (data/NankingServerData.gz, see the old db.js Manager) and inserts its
 * content into a freshly created, empty SQLite database. Only ever runs once
 * per environment - see shouldMigrate()/migrateFromJsonIfNeeded() below - after
 * which SQLite is the sole source of truth and this file is never read again.
 */
function readLegacyJson(path) {
	if(!existsSync(path)) return null
	const compressed = readFileSync(path)
	if(!compressed.length) return null
	return JSON.parse(gunzipSync(compressed).toString('utf8'))
}

/**
 * True if the JSON legacy quiz `type` value is the pre-rename 'default',
 * normalized to 'direct' here too.
 */
function normalizeDirectType(type) {
	return type === 'default' ? 'direct' : type
}

/**
 * Imports every table's worth of data from the legacy JSON structure into
 * `conn` (a SqliteConnection, already schema-initialized). Runs as a single
 * transaction: either the whole import lands, or none of it does.
 */
async function importJsonIntoSqlite(conn, json) {
	await conn.transaction(() => {
		const db = conn.db

		// entries and tags rows first, both referenced by junction tables below
		const entries = json.entries || {}
		const insertEntry = db.prepare('INSERT INTO entries (id, name, image) VALUES (?, ?, ?)')
		for(const entryId in entries) {
			const entry = entries[entryId]
			insertEntry.run(entryId, entry.name, entry.image || 'assets/unknown.svg')
		}

		const tags = json.tags || {}
		const insertTag = db.prepare('INSERT INTO tags (id, label) VALUES (?, ?)')
		for(const tagId in tags) {
			insertTag.run(tagId, tags[tagId].label)
		}

		// junction tables, now that every entry/tag row they reference exists
		const insertEntryTag = db.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)')
		for(const entryId in entries) {
			for(const tagId of entries[entryId].tags || []) {
				insertEntryTag.run(entryId, tagId)
			}
		}

		const insertTagParent = db.prepare('INSERT OR IGNORE INTO tag_parents (tag_id, parent_id) VALUES (?, ?)')
		for(const tagId in tags) {
			for(const parentId of tags[tagId].parents || []) {
				insertTagParent.run(tagId, parentId)
			}
		}

		// accounts (json key 'p#', see accounts.js AccountManager)
		const accounts = json['p#'] || {}
		const insertAccount = db.prepare(
			'INSERT INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, ?, ?)'
		)
		for(const username in accounts) {
			const account = accounts[username]
			insertAccount.run(username, account.displayLogin || username, account.hash, account.salt)
		}

		// users.<username>.quiz -> direct_quiz / dual_quiz
		// A quiz entry can reference a username with no matching 'p#' account
		// (e.g. MALImport writes straight to users.*): create a ghost account
		// row (NULL credentials) so the FK holds, matching the documented
		// "no account yet" case AccountManager must special-case on add()/login().
		const ensureGhostAccount = db.prepare(
			'INSERT OR IGNORE INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, NULL, NULL)'
		)
		const insertDirectQuiz = db.prepare(
			'INSERT INTO direct_quiz (username, entry_id, value, ts) VALUES (?, ?, ?, ?) ' +
			'ON CONFLICT (username, entry_id) DO UPDATE SET value = excluded.value, ts = excluded.ts'
		)
		const insertDualQuiz = db.prepare(
			'INSERT INTO dual_quiz (username, neg_id, pos_id, value, ts) VALUES (?, ?, ?, ?, ?) ' +
			'ON CONFLICT (username, neg_id, pos_id) DO UPDATE SET value = excluded.value, ts = excluded.ts'
		)

		const users = json.users || {}
		// Fabricated, strictly increasing timestamps: the legacy JSON never
		// stored one, only the array's insertion order, which this preserves.
		let fabricatedTs = Date.now() - 1_000_000
		for(const username in users) {
			ensureGhostAccount.run(username, username)
			for(const quiz of users[username].quiz || []) {
				const type = normalizeDirectType(quiz.type)
				fabricatedTs += 1
				if(type === 'direct') {
					insertDirectQuiz.run(username, quiz.entry, +quiz.value, fabricatedTs)
				} else if(type === 'dual') {
					// Normalize neg/pos to alphanumeric order (flipping value's sign
					// if reversed), same as User.save(): makes the UNIQUE(username,
					// neg_id, pos_id) constraint alone sufficient, matching a
					// reversed pair already imported from a different quiz entry.
					const [negId, posId, value] = quiz.neg <= quiz.pos
						? [quiz.neg, quiz.pos, +quiz.value]
						: [quiz.pos, quiz.neg, -quiz.value]
					insertDualQuiz.run(username, negId, posId, value, fabricatedTs)
				}
			}
		}

		// The legacy JSON's entry/tag ids follow the same 'n:<n>'/'t:<n>'
		// convention (see entriesRepository/tagsRepository), but were just
		// inserted straight from JSON rather than through getEntryByName()/
		// getTagByLabel() - id_sequences must be resynced now, or the very
		// first entry/tag created after this import would collide with one
		// just imported.
		seedIdSequences(db)
	})
}

/**
 * Migrates data/NankingServerData.gz into `conn` if present, then renames it
 * to `<path>.imported` so it's obviously no longer live and this import never
 * runs again for this environment. No-ops silently if the legacy file is
 * absent (fresh install: SQLite just starts empty).
 */
async function migrateFromJsonIfNeeded(conn) {
	const jsonPath = CONFIG.DB_PATH
	const json = readLegacyJson(jsonPath)
	if(json == null) return false

	console.info('Migration: importing legacy JSON database (' + jsonPath + ') into SQLite...')
	await importJsonIntoSqlite(conn, json)
	renameSync(jsonPath, jsonPath + '.imported')
	console.info('Migration complete. Legacy file renamed to ' + jsonPath + '.imported')
	return true
}

export { migrateFromJsonIfNeeded, importJsonIntoSqlite }
