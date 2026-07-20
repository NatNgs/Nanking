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
 * Sends SIGTERM to let the server run its graceful shutdown (saves data,
 * closes the HTTP server), and waits for the process to actually exit.
 */
async function stopServer(proc) {
	if(!proc || proc.exitCode !== null) return
	proc.kill('SIGTERM')
	await new Promise((resolvePromise) => proc.once('exit', resolvePromise))
}

export { startServer, stopServer, BASE_URL }
