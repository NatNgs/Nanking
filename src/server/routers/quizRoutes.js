import express, { 'static' as express_static } from 'express'
import { authenticate, returnUserData } from './userRoutes.js'


const quizRouter = express.Router()
quizRouter.use(authenticate)

quizRouter.post('/dual', (req, res) => {
	console.log('Quiz::dual', req.body)

	// Return user data
	returnUserData(req, res)
})

export default quizRouter
