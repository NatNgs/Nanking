import { createServer } from 'https'
import express, { 'static' as express_static } from 'express'
const app = express()
import { readFileSync } from 'fs'
import { networkInterfaces } from 'os'
import { urlencoded, json } from 'body-parser'
import { resolve } from 'path'
import { Accounts } from './Accounts.js'

const __project = resolve(import.meta.dirname + '/../..')

// Configuring express to use body-parser
// as middle-ware
app.use(urlencoded({ extended: false }));
app.use(json())

// HOME

app.get('/', (req, res) => {
	const file = __project + '/src/client/home.html'
	res.sendFile(file)
	console.debug(req.originalUrl, '('+ file + ')')
})
app.get('/favicon.ico', (req, res) => {
	const file = __project + '/src/client/Nanking.ico'
	console.debug(req.originalUrl, '('+ file + ')')
	res.sendFile(file)
})
app.use(express_static(__project + '/src/client'));
app.post('/login', (req, res) => {
	if(req.body.new === 'true') {
		const success = Accounts.add(req.body.login, req.body.pwd)
		if(!success) {
			res.status(400).send('Could not create account')
			console.warn(req.originalUrl, '=> 403 (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
			return
		}
	}
	const success = Accounts.login(req.body.login, req.body.pwd)
	if(success) {
		res.status(200).send('Login success')
		console.debug(req.originalUrl, '=> 200 (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
	} else {
		res.status(403).send('Login failed')
		console.warn(req.originalUrl, '=> 403 (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
	}
})

// ERRORS

app.all('{*splat}', (req, res) => {
	console.debug(req.originalUrl, '(404: Not Found)')
	res.status(404).send('404: ' + req.originalUrl)
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
createServer(options, app).listen(serverPort, () => {
	// Listing IP and ports available for connexion (LAN)
	console.info('Server listening on:')
	Object.values(networkInterfaces()).forEach((ifs) => ifs.forEach((iface) =>
		('IPv4' === iface.family)
		&& console.info('\t' + iface.address + ':' + serverPort)
	))
	console.info() // Newline
})
