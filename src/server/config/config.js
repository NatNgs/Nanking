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

/**
 * Reads `--name=value` from argv. Returns `fallback` if the flag is absent.
 */
function getArg(name, fallback) {
	const prefix = `--${name}=`
	const found = process.argv.find((a) => a.startsWith(prefix))
	return found ? found.slice(prefix.length) : fallback
}

// Environment name: CLI flag takes priority, then $ENV, then 'local'
const ENV_NAME = getArg('env', null) ?? process.env.ENV ?? 'local'

// Load local config file
const config_path = p(`./conf/conf.${ENV_NAME}.yml`)
let localConfig = {}
try {
	localConfig = loadYaml(fs.readFileSync(config_path, 'utf8'))
	console.debug(`Config file found with configuration:`, localConfig)
} catch {
	console.warn(`Config file not found or invalid (${config_path}). Starting the application with default configuration`)
}

/**
 * Centralized server configuration.
 * Each value can be overridden by localConfig
 */
const CONFIG = {
	ENV_NAME,
	PORT:                  +(localConfig.port                  || 8053                          ),
	CERT_KEY_PATH:         p(localConfig?.cert?.keyPath         || null                          ),
	CERT_CERT_PATH:        p(localConfig?.cert?.certPath        || null                          ),
	DB_PATH:               p(localConfig.dbPath                || './data/NankingServerData.gz' ),
	SQLITE_PATH:           p(localConfig.sqlitePath            || './data/nanking.sqlite'       ),
	CLIENT_DIST_PATH:      p(localConfig.clientDistPath        || './dist/client'               ),
	DATA_DIR:              p(localConfig.dataDir               || './data'                      ),
	TOKEN_VALIDITY_LIMIT:  +(localConfig?.token?.validityLimit || (16 * 60 * 60)                ) * 1000,
	TOKEN_REFRESH_RATE:    +(localConfig?.token?.refreshRate   || (1 * 60 * 60)                 ) * 1000,
	SHUTDOWN_TIMEOUT:      +(localConfig.shutdownTimeout       || (60)                          ) * 1000,
	SCORE_COMPUTE_INTERVAL:+(localConfig.scoreComputeInterval  || (3)                           ) * 1000,
	RATE_LIMIT: {
		login:         {limit: +(localConfig?.rateLimit?.login?.limit          || 6  ), windowMs: +(localConfig?.rateLimit?.login?.windowSeconds          || 60) * 1000},
		api:           {limit: +(localConfig?.rateLimit?.api?.limit            || 120), windowMs: +(localConfig?.rateLimit?.api?.windowSeconds            || 60) * 1000},
		publicProfile: {limit: +(localConfig?.rateLimit?.publicProfile?.limit  || 30 ), windowMs: +(localConfig?.rateLimit?.publicProfile?.windowSeconds  || 60) * 1000},
		page:          {limit: +(localConfig?.rateLimit?.page?.limit           || 60 ), windowMs: +(localConfig?.rateLimit?.page?.windowSeconds           || 60) * 1000},
	},
}

export default CONFIG
