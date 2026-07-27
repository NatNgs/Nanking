import { rmSync } from 'node:fs'

// Removes any leftover test database/artifacts from a previous run that
// crashed or was interrupted before its own cleanup (afterEach, graceful
// shutdown) ran. Shared by both test/globalSetup.js (unit tests) and
// test/integration/globalSetup.js (integration tests) - both point at the
// same test/tmp directory.
export default function globalSetup() {
	rmSync('test/tmp', {recursive: true, force: true})
}
