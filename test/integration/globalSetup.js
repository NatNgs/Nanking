import { rmSync } from 'node:fs'

// Removes any leftover test database/artifacts from a previous run that
// crashed or was interrupted before the server's own graceful shutdown ran.
export default function globalSetup() {
	rmSync('test/tmp', {recursive: true, force: true})
}
