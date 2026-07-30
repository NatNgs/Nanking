import express from 'express'
import { apiLimiter, loginLimiter } from '../middleware/rateLimit.js'
import userRouter from './userRoutes.js'
import quizRouter from './quizRoutes.js'
import entryRouter from './entryRoutes.js'
import tagRouter from './tagRoutes.js'
import { addAccount, login } from '../repository/accountsRepository.js'
import { getSqlite } from '../data/db.js'
import { listEntries } from '../services/entryService.js'
import { searchTags } from '../services/tagService.js'
import { paginate, compareBy } from '../lib/pagination.js'
import CONFIG from '../config/config.js'

const apiRouter = express.Router()

// Apply rate limit
apiRouter.use(apiLimiter)

apiRouter.post('/login', loginLimiter, async (req, res) => {
	const sqlite = getSqlite()
	// Create new account
	if(req.body.new === 'true') {
		const success = await addAccount(sqlite, req.body.login, req.body.pwd)
		if(!success) {
			res.status(400).send('Could not create account')
			console.warn(
				req.originalUrl, '=> 400: Could not create account (' + req.body.login
				+ (req.body.new ? ' (new account)' : '') + ')',
			)
			return
		}
	}

	// Login by username and password
	const username = await login(sqlite, req.body.login, req.body.pwd)
	if(username) {
		// Regenerate the session id on login, so a pre-login session id (fixation)
		// can never be reused as an authenticated one.
		req.session.regenerate((err) => {
			if(err) {
				console.error(req.originalUrl, '=> 500: session.regenerate() failed:', err)
				res.status(500).send('Login failed')
				return
			}
			req.session.username = username
			res.status(200).send('ok')
			console.debug(req.originalUrl, `=> 200 (${req.body.login}${req.body.new ? ' (new account)':' (using pwd)'})`)
		})
	} else {
		res.status(403).send('Login failed')
		console.warn(req.originalUrl, `=> 403: Login failed (${req.body.login}${req.body.new ? ' (new account)':''})`)
	}
})
apiRouter.post('/logout', (req, res) => {
	req.session.destroy((err) => {
		if(err) {
			console.error(req.originalUrl, '=> 500: session.destroy() failed:', err)
			res.status(500).send('Logout failed')
			return
		}
		res.clearCookie('nanking.sid')
		res.status(200).send('ok')
	})
})
apiRouter.get('/entries', async (req, res) => {
	const {q, sort, order, page, limit} = req.query
	const topicId = CONFIG.DEFAULT_TOPIC
	res.json(await listEntries(getSqlite(), topicId, {q, sort, order, page, limit}))
})
apiRouter.post('/tags/search', async (req, res) => {
	const {q, notOnEntity, notHavingAsParent, notHavingAsChild, order, page, limit} = req.body || {}
	const topicId = CONFIG.DEFAULT_TOPIC
	const tags = await searchTags(getSqlite(), topicId, {q, notOnEntity, notHavingAsParent, notHavingAsChild})
	const mapped = tags.map((tag) => ({id: tag.id, label: tag.label}))
	// If q is given, searchTag already sorted by relevance (name length): don't re-sort.
	const sorted = q ? mapped : [...mapped].sort(compareBy((t) => t.label, order || 'asc'))
	res.json(paginate(sorted, {page, limit}))
})

// Authenticated

apiRouter.use('/user', userRouter)
apiRouter.use('/quiz', quizRouter)
apiRouter.use('/entry', entryRouter)
apiRouter.use('/tag', tagRouter)


export default apiRouter
