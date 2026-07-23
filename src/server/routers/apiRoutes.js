import express from 'express'
import requireAuthentication from '../middleware/authenticate.js'
import { apiLimiter, loginLimiter } from '../middleware/rateLimit.js'
import userRouter from './userRoutes.js'
import quizRouter from './quizRoutes.js'
import entryRouter from './entryRoutes.js'
import tagRouter from './tagRoutes.js'
import ACCOUNTS from '../data/accounts.js'
import { listEntries } from '../services/entryService.js'
import { searchTags } from '../services/tagService.js'
import { paginate, compareBy } from '../lib/pagination.js'
import { persistAccount } from '../services/persistenceService.js'

const apiRouter = express.Router()

// Apply rate limit
apiRouter.use(apiLimiter)

apiRouter.post('/login', loginLimiter, async (req, res) => {
	// Create new account
	if(req.body.new === 'true') {
		const success = ACCOUNTS.add(req.body.login, req.body.pwd)
		if(!success) {
			res.status(400).send('Could not create account')
			console.warn(req.originalUrl, '=> 400: Could not create account (' + req.body.login + (req.body.new ? ' (new account)':'') + ')')
			return
		}
		// Must land in SQLite before any direct_quiz/dual_quiz row created
		// right after login can reference this username (FK constraint) - see
		// persistenceService.js's persistAccount().
		await persistAccount(req.body.login.trim().toLowerCase())
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
	const {q, sort, order, page, limit} = req.query
	res.json(listEntries({q, sort, order, page, limit}))
})
apiRouter.post('/tags/search', (req, res) => {
	const {q, notOnEntity, notHavingAsParent, notHavingAsChild, sort, order, page, limit} = req.body || {}
	const tags = searchTags({q, notOnEntity, notHavingAsParent, notHavingAsChild})
	const mapped = tags.map((tag) => ({id: tag.id, label: tag.label}))
	// If q is given, TAGS.searchTag already sorted by relevance (name length): don't re-sort.
	const sorted = q ? mapped : [...mapped].sort(compareBy((t) => t.label, order || 'asc'))
	res.json(paginate(sorted, {page, limit}))
})

// Authenticated

apiRouter.use('/user', userRouter)
apiRouter.use('/quiz', quizRouter)
apiRouter.use('/entry', entryRouter)
apiRouter.use('/tag', tagRouter)


export default apiRouter
