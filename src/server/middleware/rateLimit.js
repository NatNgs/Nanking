import { rateLimit, ipKeyGenerator, MINUTE } from 'express-rate-limit'

/**
 * Sends a 429 response with a `Retry-After` header, so the client can inform
 * the user instead of silently failing.
 */
function handler(req, res) {
	const retryAfterSeconds = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
	res.setHeader('Retry-After', Math.max(retryAfterSeconds, 1))
	res.status(429).send('Too many requests, please try again later.')
}

/**
 * Strict limit on `/login`, keyed by IP: slows down brute-force attempts on
 * account passwords. Runs before authentication, so no user is known yet.
 */
const loginLimiter = rateLimit({
	windowMs: MINUTE,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => ipKeyGenerator(req.ip),
	handler,
})

/**
 * Looser limit on authenticated routes (`/user`, `/quiz`), keyed by username
 * so it does not penalize multiple users behind the same NAT/proxy. Must run
 * after the `authenticate` middleware, since it relies on `req.user`.
 */
const apiLimiter = rateLimit({
	windowMs: MINUTE,
	limit: 60,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => req.user?.username || ipKeyGenerator(req.ip),
	handler,
})

export { loginLimiter, apiLimiter }
