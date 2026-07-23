import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import { load as loadYaml } from 'js-yaml'

/**
 * Reads the same conf/conf.<env>.yml file the Express server reads (see
 * src/server/config/config.js), so the dev proxy targets the protocol/port
 * the server will actually be listening on: HTTPS when `cert.keyPath` is
 * set, plain HTTP otherwise, same as server.js's own fallback logic.
 */
function resolveApiTarget() {
	const envName = process.argv.find((a) => a.startsWith('--env='))?.slice('--env='.length) ?? process.env.ENV ?? 'local'
	let localConfig = {}
	try {
		localConfig = loadYaml(fs.readFileSync(`conf/conf.${envName}.yml`, 'utf8'))
	} catch {
		// No/invalid config file: same default fallback as the server
	}

	const port = localConfig.port || 8053
	const protocol = localConfig?.cert?.keyPath ? 'https' : 'http'
	return `${protocol}://localhost:${port}`
}

export default defineConfig(({mode}) => {
	const isProduction = mode === 'production'
	return {
		root: 'src/client',
		plugins: [react()],
		build: {
			outDir: '../../dist/client',
			emptyOutDir: true,
			minify: isProduction,
			sourcemap: isProduction ? 'hidden' : true,
		},
		server: {
			proxy: {
				'/api': {target: resolveApiTarget(), secure: false},
			},
		},
	}
})
