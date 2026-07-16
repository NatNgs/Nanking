import { createServer } from 'https'
import express, { 'static' as express_static } from 'express'
const app = express()
import { readFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { urlencoded, json } from 'body-parser'
import { resolve } from 'path'
import DB from './data/db.js'
import ACCOUNTS from './data/accounts.js'
import userRouter from './routers/userRoutes.js'

const __project = resolve(import.meta.dirname + '/../..')

// Configuring express to use body-parser
// as middle-ware
app.use(urlencoded({ extended: false }));
app.use(json())


// Unauthenticated

app.get('/', (req, res) => {
	const file = __project + '/src/client/public/home.html'
	//console.debug(req.originalUrl, '('+ file + ')')
	res.sendFile(file)
})
app.get('/favicon.ico', (req, res) => {
	const file = __project + '/src/client/Nanking.ico'
	//console.debug(req.originalUrl, '('+ file + ')')
	res.sendFile(file)
})
app.use(express_static(__project + '/src/client/public'));
app.post('/login', (req, res) => {
	if(req.body.new === 'true') {
		const success = ACCOUNTS.add(req.body.login, req.body.pwd)
		if(!success) {
			res.status(400).send('Could not create account')
			console.warn(req.originalUrl, '=> 400: Could not create account (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
			return
		}
	}
	const newToken = ACCOUNTS.login(req.body.login, req.body.pwd)
	if(newToken) {
		res.setHeader('authorization', newToken).status(200).send('ok')
		console.debug(req.originalUrl, '=> 200 (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
	} else {
		res.status(403).send('Login failed')
		console.warn(req.originalUrl, '=> 403: Login failed (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
	}
})

// Authenticated

app.use('/user', userRouter)


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
	key: readFileSync(__project + '/cert/server.key'),
	cert: readFileSync(__project + '/cert/server.cert'),
}

const serverPort = 8053
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
async function gracefulShutdown() {
	if(shutting_down) return

	console.log('Shutdown triggered, gracefully stopping...');

	shutting_down = setTimeout(() => {
		console.error('Shutdown timed out, force stopping...')
		process.exit(-1)
	}, 10000) // 10s timeout

	// Stop server
	server.close();

	console.log('Shutdown complete');
	process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);  // Kill command
process.on('SIGINT', gracefulShutdown);   // Ctrl+C
process.on('SIGHUP', gracefulShutdown);   // Terminal closure
