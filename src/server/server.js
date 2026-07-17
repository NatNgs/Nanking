import { createServer } from 'node:https'
import express, { 'static' as express_static } from 'express'
const app = express()
import { readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { urlencoded, json } from 'body-parser'
import { resolve } from 'node:path'
import CONFIG from './config/config.js'
import DB from './data/db.js'
import ACCOUNTS from './data/accounts.js'
import ENTRIES from './data/entries.js'
import { saveAllUsers } from './data/user.js'
import { loginLimiter } from './middleware/rateLimit.js'
import userRouter from './routers/userRoutes.js'
import quizRouter from './routers/quizRoutes.js'

const __project = resolve(import.meta.dirname + '/../..')

// Configuring express to use body-parser
// as middle-ware
app.use(urlencoded({ extended: false }));
app.use(json())


// Unauthenticated

app.get('/', (req, res) => {
	const file = __project + '/src/client/pages/home/home.html'
	//console.debug(req.originalUrl, '('+ file + ')')
	res.sendFile(file)
})
app.get('/pages/home/home.html', (req, res) => {
	res.redirect('/')
})
app.get('/favicon.ico', (req, res) => {
	const file = __project + '/src/client/assets/Nanking.ico'
	//console.debug(req.originalUrl, '('+ file + ')')
	res.sendFile(file)
})
app.use(express_static(__project + '/src/client'));
app.post('/login', loginLimiter, (req, res) => {
	// Create new account
	if(req.body.new === 'true') {
		const success = ACCOUNTS.add(req.body.login, req.body.pwd)
		if(!success) {
			res.status(400).send('Could not create account')
			console.warn(req.originalUrl, '=> 400: Could not create account (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
			return
		}
	}

	// Check if token is valid
	if(req.headers.authorization) {
		const user = ACCOUNTS.check_token(req.headers.authorization, req.ip)
		if(!user) {
			res.status(401).send('Unauthorized')
			console.warn(req.originalUrl, '=> 401 (Try login with unknown or expired token, or IP mismatch)')
			return
		}
		ACCOUNTS.refresh_token(user, req.ip, req.headers.authorization)
		res.status(200).send('ok')
		console.debug(req.originalUrl, `=> 200 (${user} (using token))`)
		return
	}

	// Login by username and password
	const newToken = ACCOUNTS.login(req.body.login, req.body.pwd, req.ip)
	if(newToken) {
		res.setHeader('authorization', newToken).status(200).send('ok')
		console.debug(req.originalUrl, `=> 200 (${req.body.login}${req.body.new ? ' (new account)':' (using pwd)'})`)
	} else {
		res.status(403).send('Login failed')
		console.warn(req.originalUrl, `=> 403: Login failed (${req.body.login}${req.body.new ? ' (new account)':''})`)
	}
})

// Authenticated

app.use('/user', userRouter)
app.use('/quiz', quizRouter)


// ERRORS

app.all('{*splat}', (req, res) => {
	console.debug(req.originalUrl, '(404: Not Found)')
	res.status(404).redirect('/')
})


//
// Launching server

// Creating object of key and certificate
// for SSL
const options = {
	key: readFileSync(CONFIG.CERT_KEY_PATH),
	cert: readFileSync(CONFIG.CERT_CERT_PATH),
}

const serverPort = CONFIG.PORT
const server = createServer(options, app).listen(serverPort, () => {
	// Listing IP and ports available for connexion (LAN)
	console.info('Server listening on:')
	Object.values(networkInterfaces()).forEach((ifs) => ifs.forEach((iface) =>
		('IPv4' === iface.family)
		&& console.info('\t' + iface.address + ':' + serverPort)
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
