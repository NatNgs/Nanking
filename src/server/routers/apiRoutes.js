import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { apiLimiter, loginLimiter } from '../middleware/rateLimit.js'
import userRouter from './userRoutes.js'
import quizRouter from './quizRoutes.js'
import entryRouter from './entriesRoutes.js'
import ACCOUNTS from '../data/accounts.js'
import ENTRIES from '../data/entries.js'

const apiRouter = express.Router()

// Apply rate limit
apiRouter.use(apiLimiter)

apiRouter.post('/login', loginLimiter, (req, res) => {
	// Create new account
	if(req.body.new === 'true') {
		const success = ACCOUNTS.add(req.body.login, req.body.pwd)
		if(!success) {
			res.status(400).send('Could not create account')
			console.warn(req.originalUrl, '=> 400: Could not create account (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
			return
		}
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
apiRouter.get('/entries', (req, res) => {
	const scores = ENTRIES.getGlobalScores()
	const content = [] // [{id, name, score, image}]
	for(const [id, score] of Object.entries(scores)) {
		const entry = ENTRIES.getEntryById(id)
		content.push({
			id: entry.id,
			label: entry.name,
			score: score,
			image: entry.image,
		})
	}
	res.json(content)
})

// Authenticated

apiRouter.use('/user', userRouter)
apiRouter.use('/quiz', quizRouter)
apiRouter.use('/entry', entryRouter)


export default apiRouter
