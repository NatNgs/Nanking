import { createServer as createHttpsServer } from 'node:https'
import { createServer as createHttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'

import express, { 'static' as express_static } from 'express'
const app = express()

import { urlencoded, json } from 'body-parser'

import CONFIG from './config/config.js'
import DB from './data/db.js'
import ACCOUNTS from './data/accounts.js'
import ENTRIES from './data/entries.js'
import { loadAllUsers, saveAllUsers } from './data/user.js'

import { pageLimiter } from './middleware/rateLimit.js'
import apiRouter from './routers/apiRoutes.js'

import { launchComputation } from './services/scoresComputerService.js'


// Init previously saved user data
loadAllUsers()

// Init score computation worker
launchComputation()

// Configuring express to use body-parser as middle-ware
app.use(urlencoded({ extended: false }));
app.use(json())

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

// Files
app.use(express_static(CONFIG.CLIENT_DIST_PATH), pageLimiter);

// API
app.use('/api', apiRouter)

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

// HTTPS by default. Pass --http on the command line to force plain HTTP (development
// only): certificate options are then ignored entirely, valid or not.
const useHttp = process.argv.includes('--http')

let protocol
let server
if(useHttp) {
	protocol = 'http'
	console.warn('Starting in plain HTTP mode (--http). Do not use this mode in production.')
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
		console.error('Pass --http to start without HTTPS (development only).')
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

	// Stop server, then persist data and exit once fully closed
	server.close(() => {
		clearTimeout(shutting_down)

		// Push in-memory changes from each manager, then flush the database to disk once
		ACCOUNTS.save()
		ENTRIES.save()
		saveAllUsers()
		DB.save(CONFIG.DB_PATH)

		console.log('Shutdown complete')
		process.exit(0)
	})
}
process.on('SIGTERM', gracefulShutdown);  // Kill command
process.on('SIGINT', gracefulShutdown);   // Ctrl+C
process.on('SIGHUP', gracefulShutdown);   // Terminal closure
