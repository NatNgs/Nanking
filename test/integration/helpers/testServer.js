import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const BASE_URL = 'http://localhost:8153'
const STARTUP_TIMEOUT_MS = 10000

/**
 * Starts the real Express server as a subprocess, configured via
 * `conf/conf.test.yml` (isolated port/DB, relaxed rate limits). Resolves
 * once the server logs its "listening" line, rather than waiting a fixed
 * delay.
 */
function startServer() {
	return new Promise((resolvePromise, reject) => {
		const proc = spawn(process.execPath, ['src/server/server.js', '--env=test'], {
			stdio: ['ignore', 'pipe', 'pipe'],
		})

		let output = ''
		let settled = false

		function onData(chunk) {
			output += chunk.toString()
			if(!settled && output.includes('Server listening on:')) {
				settled = true
				proc.stdout.off('data', onData)
				resolvePromise(proc)
			}
		}
		proc.stdout.on('data', onData)
		proc.stderr.on('data', (chunk) => { output += chunk.toString() })

		proc.once('exit', (code) => {
			if(!settled) reject(new Error(`Server exited early (code ${code}):\n${output}`))
		})

		delay(STARTUP_TIMEOUT_MS).then(() => {
			if(!settled) {
				settled = true
				proc.kill()
				reject(new Error(`Server did not start in time:\n${output}`))
			}
		})
	})
}

/**
 * Triggers the server's graceful shutdown (saves data, closes SQLite, closes
 * the HTTP server) via its loopback-only /_shutdown endpoint, and waits for
 * the process to actually exit. Not done via SIGTERM: on Windows, killing a
 * spawned child process with SIGTERM does not reliably run its
 * `process.on('SIGTERM', ...)` handler (the process just exits on the signal
 * directly), which used to just skip a JSON flush but now leaves the SQLite
 * file locked for the next test file's server to fail to open - see
 * server.js's own /_shutdown route for the full explanation.
 */
async function stopServer(proc) {
	if(!proc || proc.exitCode !== null) return
	try {
		await fetch(BASE_URL + '/_shutdown', {method: 'POST'})
	} catch {
		// Server already gone (e.g. crashed earlier in the test): fall through
		// to killing the process directly instead of hanging on the fetch.
		proc.kill()
	}
	await new Promise((resolvePromise) => proc.once('exit', resolvePromise))
}

export { startServer, stopServer, BASE_URL }
