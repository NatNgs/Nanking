import { rmSync } from 'node:fs'

// Removes any leftover temporary test database files from a previous run
// that crashed or was interrupted before its own afterEach() cleanup ran.
export default function globalSetup() {
	rmSync('test/tmp', {recursive: true, force: true})
}
