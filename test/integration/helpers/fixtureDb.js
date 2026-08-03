import { SqliteConnection, seedIdSequences } from '../../../src/server/data/sqliteDb.js'
import CONFIG from '../../../src/server/config/config.js'

/**
 * Builds a pre-filled SQLite file at `path` (same schema as the real server -
 * see sqliteDb.js) so the tags integration test can start from a rich,
 * already-scored state instead of rebuilding tags/entries/votes from scratch
 * through the UI for every test. Writes SQL directly rather than going
 * through the *Repository.js modules: this needs its own throwaway
 * connection, separate from the production one threaded through
 * db.js's setSqlite().
 *
 * Contains only entries/tags/quiz data and a ghost account row (no
 * credentials - see accounts.js's own "ghost account" handling): the test
 * itself registers a real account through the UI, using `username`, which
 * attaches credentials to this same row. Its quiz history is pre-seeded here
 * under that same username, so the fresh account inherits already-computed
 * scores as soon as it logs in.
 *
 * Tag hierarchy (parent = more generic, child = more specific):
 *   Living being <- Mammal <- Cat
 *                     ^------- Dog
 *   Animal       <-/
 * (Mammal has two parents: Animal and Living being — multiple inheritance)
 *
 * Entries:
 *   'Whiskers'  tagged directly with Cat
 *   'Rex'       tagged directly with Dog
 *   'Generic Mammal thing' tagged directly with Mammal
 *   'Untagged thing' has no tag at all
 */
async function buildFixtureDb(path, username) {
	const sqlite = new SqliteConnection(path)

	const topicId = CONFIG.DEFAULT_TOPIC

	await sqlite.transaction(() => {
		const db = sqlite.db

		// The server's own migration only creates this row for a pre-existing
		// (pre-topics) database - a fresh file (like this fixture's) starts
		// with an empty `topics` table, so it must be seeded explicitly here.
		db.prepare('INSERT INTO topics (id, label) VALUES (?, ?)').run(topicId, 'Anime')

		const insertTag = db.prepare('INSERT INTO tags (topic_id, id, label) VALUES (?, ?, ?)')
		insertTag.run(topicId, 't:0', 'Living being')
		insertTag.run(topicId, 't:1', 'Animal')
		insertTag.run(topicId, 't:2', 'Mammal')
		insertTag.run(topicId, 't:3', 'Cat')
		insertTag.run(topicId, 't:4', 'Dog')

		const insertTagParent = db.prepare('INSERT INTO tag_parents (topic_id, tag_id, parent_id) VALUES (?, ?, ?)')
		insertTagParent.run(topicId, 't:2', 't:1') // Mammal -> Animal
		insertTagParent.run(topicId, 't:2', 't:0') // Mammal -> Living being
		insertTagParent.run(topicId, 't:3', 't:2') // Cat -> Mammal
		insertTagParent.run(topicId, 't:4', 't:2') // Dog -> Mammal

		const insertEntry = db.prepare('INSERT INTO entries (topic_id, id, name) VALUES (?, ?, ?)')
		insertEntry.run(topicId, 'n:0', 'Whiskers')
		insertEntry.run(topicId, 'n:1', 'Rex')
		insertEntry.run(topicId, 'n:2', 'Generic Mammal thing')
		insertEntry.run(topicId, 'n:3', 'Untagged thing')

		const insertEntryTag = db.prepare('INSERT INTO entry_tags (topic_id, entry_id, tag_id) VALUES (?, ?, ?)')
		insertEntryTag.run(topicId, 'n:0', 't:3') // Whiskers -> Cat
		insertEntryTag.run(topicId, 'n:1', 't:4') // Rex -> Dog
		insertEntryTag.run(topicId, 'n:2', 't:2') // Generic Mammal thing -> Mammal

		// Ghost account row (no credentials yet): the test's own
		// registerAndLogIn() (UI flow) later attaches real credentials to this
		// same row - see AccountManager.add()'s "ghost account" handling.
		db.prepare(
			'INSERT INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, NULL, NULL)'
		).run(username, username)

		// Pre-seed the test account's vote history, so its scores are already
		// non-trivial (not stuck at 0.5) as soon as it registers and logs in.
		const insertDirectQuiz = db.prepare(
			'INSERT INTO direct_quiz (topic_id, username, entry_id, value, ts) VALUES (?, ?, ?, ?, ?)'
		)
		insertDirectQuiz.run(topicId, username, 'n:0', 0.9, 1)
		insertDirectQuiz.run(topicId, username, 'n:1', 0.2, 2)
		insertDirectQuiz.run(topicId, username, 'n:2', 0.6, 3)

		// user_entry is never recomputed on read (see scoresComputerService's
		// design notes) - seed it here too, or the account would show no score
		// at all until the next global computation cycle picks it up.
		const insertUserEntry = db.prepare(
			'INSERT INTO user_entry (username, topic_id, entry_id, score) VALUES (?, ?, ?, ?)'
		)
		insertUserEntry.run(username, topicId, 'n:0', 0.9)
		insertUserEntry.run(username, topicId, 'n:1', 0.2)
		insertUserEntry.run(username, topicId, 'n:2', 0.6)

		// Entry/tag rows above were inserted with explicit ids, bypassing
		// getEntryByName()/getTagByLabel() (the only normal callers of the
		// id_sequences counter) - resync it now, or the test's first UI-driven
		// creation (e.g. a new tag from the picker) would collide with one of
		// the ids seeded here.
		seedIdSequences(db)
	})

	await sqlite.close()

	return {
		whiskers: {id: 'n:0'}, rex: {id: 'n:1'}, genericMammal: {id: 'n:2'},
		animal: {id: 't:1'}, mammal: {id: 't:2'}, cat: {id: 't:3'}, dog: {id: 't:4'}, livingBeing: {id: 't:0'},
	}
}

export { buildFixtureDb }
