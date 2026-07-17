import { resolve } from 'node:path'

const __project = resolve(import.meta.dirname + '/../../..')

/**
 * Centralized server configuration.
 * Each value can be overridden by an environment variable of the same name.
 */
const CONFIG = {
	PORT: +(process.env.PORT || 8053),
	CERT_KEY_PATH: process.env.CERT_KEY_PATH || (__project + '/cert/server.key'),
	CERT_CERT_PATH: process.env.CERT_CERT_PATH || (__project + '/cert/server.cert'),
	DB_PATH: process.env.DB_PATH || (__project + '/data/Nanking-server.json'),
	CLIENT_DIST_PATH: process.env.CLIENT_DIST_PATH || (__project + '/dist/client'),
	TOKEN_VALIDITY_LIMIT: +(process.env.TOKEN_VALIDITY_LIMIT || 16 * 60 * 60 * 1000), // 16 hours
	TOKEN_REFRESH_RATE: +(process.env.TOKEN_REFRESH_RATE || 1 * 60 * 60 * 1000), // 1 hour
	SHUTDOWN_TIMEOUT: +(process.env.SHUTDOWN_TIMEOUT || 60 * 1000), // 60 seconds
}

export default CONFIG
