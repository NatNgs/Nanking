import { resolve } from 'node:path'
import fs from 'node:fs'
import { load as loadYaml } from 'js-yaml'

const __project = resolve(import.meta.dirname + '/../../..')


// Resolve given path
function p(optPath) {
	if(optPath == null) return null
	if(optPath.startsWith('./')) return resolve(optPath.replace('./', __project + '/'))
	return resolve(optPath)
}

// Load local config file
const config_path = p('./data/config.local.yml')
let localConfig = {}
try {
	localConfig = loadYaml(fs.readFileSync(config_path, 'utf8'))
	console.debug(`Config file found with configuration:`, localConfig)
} catch {
	console.warn(`Config file not found or invalid (${config_path}). Starting the application with default configuration`)
}

/**
 * Centralized server configuration.
 * Each value can be overridden by an environment variable of the same name.
 */
const CONFIG = {
	PORT:                +(localConfig.port                 || process.env.PORT                 || 8053                          ),
	CERT_KEY_PATH:       p(localConfig?.cert.keyPath        || process.env.CERT_KEY_PATH        || null                          ),
	CERT_CERT_PATH:      p(localConfig?.cert.certPath       || process.env.CERT_CERT_PATH       || null                          ),
	DB_PATH:             p(localConfig.dbPath               || process.env.DB_PATH              || './data/NankingServerData.gz' ),
	CLIENT_DIST_PATH:    p(localConfig.clientDistPath       || process.env.CLIENT_DIST_PATH     || './dist/client'               ),
	TOKEN_VALIDITY_LIMIT:+(localConfig?.token.validityLimit || process.env.TOKEN_VALIDITY_LIMIT || (16 * 60 * 60)                ) * 1000,
	TOKEN_REFRESH_RATE:  +(localConfig?.token.refreshRate   || process.env.TOKEN_REFRESH_RATE   || (1 * 60 * 60)                 ) * 1000,
	SHUTDOWN_TIMEOUT:    +(localConfig.shutdownTimeout      || process.env.SHUTDOWN_TIMEOUT     || (60)                          ) * 1000,
}

export default CONFIG
