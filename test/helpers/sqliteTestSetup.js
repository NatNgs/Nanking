import { beforeEach, afterEach } from 'node:test'
import { SqliteConnection } from '../../src/server/data/sqliteDb.js'

/**
 * Wires the beforeEach/afterEach pair every data/service test file repeats:
 * a fresh in-memory SqliteConnection before each test, closed after. Returns
 * a holder object whose `.sqlite` property is only valid inside a test (set
 * in beforeEach, so read it lazily - never destructure it at module scope).
 *
 * Usage:
 *   const db = useSqliteFixture()
 *   let sqlite
 *   beforeEach(() => { sqlite = db.sqlite })
 *   ...
 */
function useSqliteFixture() {
	const holder = {sqlite: null}
	beforeEach(() => {
		holder.sqlite = new SqliteConnection(':memory:')
	})
	afterEach(async () => {
		await holder.sqlite.close()
	})
	return holder
}

export { useSqliteFixture }
