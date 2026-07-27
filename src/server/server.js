import { createServer as createHttpsServer } from 'node:https'
import { createServer as createHttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

import express, { 'static' as express_static } from 'express'
const app = express()

import { urlencoded, json } from 'body-parser'
import session from 'express-session'

import CONFIG from './config/config.js'
import { openSqlite } from './data/sqliteDb.js'
import * as persistenceService from './services/persistenceService.js'

import { pageLimiter } from './middleware/rateLimit.js'
import apiRouter from './routers/apiRoutes.js'

import { launchComputation } from './services/scoresComputerService.js'


// Explicitly open the one production SQLite connection (running the one-shot
// legacy JSON import, if any - see sqliteDb.js/migrateFromJson.js), and hand
// it to persistenceService.js before anything else touches persisted data.
// Deliberately not done at either module's top level - see sqliteDb.js's own
// openSqlite() docstring for why.
const SQLITE = await openSqlite(CONFIG.SQLITE_PATH)
persistenceService.init(SQLITE)

// Load all persisted data from SQLite into the in-memory singletons.
await persistenceService.loadAll()

// Init score computation worker
launchComputation()

// Configuring express to use body-parser as middle-ware
app.use(urlencoded({ extended: false }));
app.use(json())

// Cookie-based session (HttpOnly, so a script cannot read it from the
// client - unlike the previous localStorage-based token). Backed by the
// default in-memory MemoryStore: sessions do not survive a server restart,
// deemed acceptable for this single-instance server (see README's TODO).
app.set('trust proxy', 1)
app.use(session({
	name: 'nanking.sid',
	secret: CONFIG.SESSION_SECRET,
	resave: false,
	saveUninitialized: false,
	rolling: true,
	cookie: {
		httpOnly: true,
		secure: CONFIG.CERT_KEY_PATH != null,
		sameSite: 'lax',
		maxAge: CONFIG.TOKEN_VALIDITY_LIMIT,
	},
}))

/* HARD DEBUG */
app.all('{*path}', (req, res, next) => {
	console.debug(req.method, req.originalUrl, req.ip)
	next()
})

// Home
app.get('/', pageLimiter, (req, res) => {
	const file = CONFIG.CLIENT_DIST_PATH + '/index.html'
	res.sendFile(file)
})

// Test-only graceful shutdown trigger: on Windows, killing a spawned child
// process with SIGTERM does not reliably run its `process.on('SIGTERM', ...)`
// handler (the process exits on the signal directly, before the JS event
// loop gets to react), which used to just skip a JSON flush but now leaves
// the SQLite file locked for whatever starts next. Integration tests call
// this instead of relying on the OS signal - see test/integration/helpers/testServer.js.
// Restricted to loopback: never reachable from the network.
app.post('/_shutdown', (req, res) => {
	if(req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') {
		res.status(403).end()
		return
	}
	res.status(200).end()
	gracefulShutdown()
})

// API
app.use('/api', apiRouter)

// Files
app.use(express_static(CONFIG.CLIENT_DIST_PATH), pageLimiter);

// ERRORS
app.all('{*path}', (req, res) => {
	console.debug(req.originalUrl, '(404: Not Found)')
	if(req.path.startsWith('/api/')) {
		res.status(404).end()
	} else {
		res.status(404).sendFile(CONFIG.CLIENT_DIST_PATH + '/index.html')
	}
})


//
// Launching server

// HTTP if no certificate is configured (development only), HTTPS otherwise.
let protocol
let server
if(CONFIG.CERT_KEY_PATH == null) {
	protocol = 'http'
	console.warn('No certificate configured: starting in plain HTTP mode. Do not use this mode in production.')
	server = createHttpServer(app)
} else {
	protocol = 'https'
	let options
	try {
		options = {
			key: readFileSync(CONFIG.CERT_KEY_PATH),
			cert: readFileSync(CONFIG.CERT_CERT_PATH),
		}
	} catch(e) {
		console.error('Could not read SSL certificate/key (' + e.message + ').')
		process.exit(1)
	}
	server = createHttpsServer(options, app)
}

const serverPort = CONFIG.PORT
server.listen(serverPort, () => {
	// Listing IP and ports available for connexion (LAN)
	console.info('Server listening on:')
	Object.values(networkInterfaces()).forEach((ifs) => ifs.forEach((iface) =>
		('IPv4' === iface.family)
		&& console.info('\t' + protocol + '://' + iface.address + ':' + serverPort)
	))
	console.info() // Newline
})

//
// Listen for termination signals
let shutting_down = null
function gracefulShutdown() {
	if(shutting_down) return

	console.log('Shutdown triggered, gracefully stopping...')

	shutting_down = setTimeout(() => {
		console.error('Shutdown timed out, force stopping...')
		process.exit(-1)
	}, CONFIG.SHUTDOWN_TIMEOUT)

	// Stop server, then persist data and exit once fully closed. Unlike the
	// fire-and-forget save calls made during normal operation (see
	// entryService.js/tagService.js), every save here is awaited: this is
	// the last chance to flush in-memory changes to SQLite before the
	// process exits, so none of it can be left in flight.
	server.close(async () => {
		clearTimeout(shutting_down)

		await Promise.all([
			persistenceService.saveAccounts(),
			persistenceService.saveEntries(),
			persistenceService.saveTags(),
			persistenceService.saveAllUsers(),
		])
		await SQLITE.close()

		console.log('Shutdown complete')
		process.exit(0)
	})
}
process.on('SIGTERM', gracefulShutdown);  // Kill command
process.on('SIGINT', gracefulShutdown);   // Ctrl+C
process.on('SIGHUP', gracefulShutdown);   // Terminal closure
