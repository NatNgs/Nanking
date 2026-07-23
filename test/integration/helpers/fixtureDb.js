import { SqliteConnection } from '../../../src/server/data/sqliteDb.js'

/**
 * Builds a pre-filled SQLite file at `path` (same schema as the real server -
 * see sqliteDb.js) so the tags integration test can start from a rich,
 * already-scored state instead of rebuilding tags/entries/votes from scratch
 * through the UI for every test. Writes SQL directly (like migrateFromJson.js)
 * rather than going through EntriesManager/TagsManager/User/
 * persistenceService.js: those are all only ever wired to the production
 * SQLITE singleton, and this needs its own throwaway connection instead.
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

	await sqlite.transaction(() => {
		const db = sqlite.db

		const insertTag = db.prepare('INSERT INTO tags (id, label) VALUES (?, ?)')
		insertTag.run('t:0', 'Living being')
		insertTag.run('t:1', 'Animal')
		insertTag.run('t:2', 'Mammal')
		insertTag.run('t:3', 'Cat')
		insertTag.run('t:4', 'Dog')

		const insertTagParent = db.prepare('INSERT INTO tag_parents (tag_id, parent_id) VALUES (?, ?)')
		insertTagParent.run('t:2', 't:1') // Mammal -> Animal
		insertTagParent.run('t:2', 't:0') // Mammal -> Living being
		insertTagParent.run('t:3', 't:2') // Cat -> Mammal
		insertTagParent.run('t:4', 't:2') // Dog -> Mammal

		const insertEntry = db.prepare('INSERT INTO entries (id, name) VALUES (?, ?)')
		insertEntry.run('n:0', 'Whiskers')
		insertEntry.run('n:1', 'Rex')
		insertEntry.run('n:2', 'Generic Mammal thing')
		insertEntry.run('n:3', 'Untagged thing')

		const insertEntryTag = db.prepare('INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)')
		insertEntryTag.run('n:0', 't:3') // Whiskers -> Cat
		insertEntryTag.run('n:1', 't:4') // Rex -> Dog
		insertEntryTag.run('n:2', 't:2') // Generic Mammal thing -> Mammal

		// Ghost account row (no credentials yet): the test's own
		// registerAndLogIn() (UI flow) later attaches real credentials to this
		// same row - see AccountManager.add()'s "ghost account" handling.
		db.prepare(
			'INSERT INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, NULL, NULL)'
		).run(username, username)

		// Pre-seed the test account's vote history, so its scores are already
		// non-trivial (not stuck at 0.5) as soon as it registers and logs in.
		const insertDirectQuiz = db.prepare(
			'INSERT INTO direct_quiz (username, entry_id, value, ts) VALUES (?, ?, ?, ?)'
		)
		insertDirectQuiz.run(username, 'n:0', 0.9, 1)
		insertDirectQuiz.run(username, 'n:1', 0.2, 2)
		insertDirectQuiz.run(username, 'n:2', 0.6, 3)
	})

	await sqlite.close()

	return {
		whiskers: {id: 'n:0'}, rex: {id: 'n:1'}, genericMammal: {id: 'n:2'},
		animal: {id: 't:1'}, mammal: {id: 't:2'}, cat: {id: 't:3'}, dog: {id: 't:4'}, livingBeing: {id: 't:0'},
	}
}

export { buildFixtureDb }
