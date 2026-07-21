import { Manager } from '../../../src/server/data/db.js'
import { EntriesManager } from '../../../src/server/data/entries.js'
import { TagsManager } from '../../../src/server/data/tags.js'
import { User } from '../../../src/server/data/user.js'
import { DefaultValueQuiz } from '../../../src/server/data/quiz.js'

/**
 * Builds a pre-filled DB file at `path` (same on-disk format as the real
 * server: gzip-compressed JSON, written via Manager.save()) so the tags
 * integration test can start from a rich, already-scored state instead of
 * rebuilding tags/entries/votes from scratch through the UI for every test.
 *
 * Contains only entries/tags/quiz data (no account): the test itself
 * registers a real account through the UI, using `username`. Its quiz
 * history is pre-seeded here under that same username, so the fresh account
 * inherits already-computed scores as soon as it logs in.
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
function buildFixtureDb(path, username) {
	const db = new Manager({})

	const entries = new EntriesManager(db)
	const tags = new TagsManager(db)

	const livingBeing = tags.getTagByLabel('Living being', true)
	const animal = tags.getTagByLabel('Animal', true)
	const mammal = tags.getTagByLabel('Mammal', true)
	const cat = tags.getTagByLabel('Cat', true)
	const dog = tags.getTagByLabel('Dog', true)
	tags.addParent(mammal.id, animal.id)
	tags.addParent(mammal.id, livingBeing.id)
	tags.addParent(cat.id, mammal.id)
	tags.addParent(dog.id, mammal.id)

	const whiskers = entries.getEntryByName('Whiskers', true)
	whiskers.tags.push(cat.id)
	const rex = entries.getEntryByName('Rex', true)
	rex.tags.push(dog.id)
	const genericMammal = entries.getEntryByName('Generic Mammal thing', true)
	genericMammal.tags.push(mammal.id)
	entries.getEntryByName('Untagged thing', true)

	entries.save()
	tags.save()

	// Pre-seed the test account's vote history, so its scores are already
	// non-trivial (not stuck at 0.5) as soon as it registers and logs in.
	const user = new User(db, username)
	user.didQuiz(new DefaultValueQuiz(whiskers, 0.9))
	user.didQuiz(new DefaultValueQuiz(rex, 0.2))
	user.didQuiz(new DefaultValueQuiz(genericMammal, 0.6))
	user.save()

	db.save(path)

	return {whiskers, rex, genericMammal, animal, mammal, cat, dog, livingBeing}
}

export { buildFixtureDb }
