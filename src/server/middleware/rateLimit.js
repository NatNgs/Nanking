import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import CONFIG from '../config/config.js'

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
	windowMs: CONFIG.RATE_LIMIT.login.windowMs,
	limit: CONFIG.RATE_LIMIT.login.limit,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => ipKeyGenerator(req.ip),
	handler,
})

/**
 * Looser limit on authenticated routes (`/user`, `/quiz`), keyed by username
 * so it does not penalize multiple users behind the same NAT/proxy. Reads
 * `req.session.username` directly rather than `req.user`, since this limiter
 * runs before the `authenticate` middleware on some routes.
 */
const apiLimiter = rateLimit({
	windowMs: CONFIG.RATE_LIMIT.api.windowMs,
	limit: CONFIG.RATE_LIMIT.api.limit,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => req.session?.username || ipKeyGenerator(req.ip),
	handler,
})

/**
 * Looser limit on the public profile route (`GET /user/:username`), keyed by
 * IP. Calibrated for casual browsing, not for password brute-forcing like
 * `loginLimiter` - kept separate rather than reused for that reason.
 */
const publicProfileLimiter = rateLimit({
	windowMs: CONFIG.RATE_LIMIT.publicProfile.windowMs,
	limit: CONFIG.RATE_LIMIT.publicProfile.limit,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => ipKeyGenerator(req.ip),
	handler,
})

/**
 * Limit on all routes outside of API
 */
const pageLimiter = rateLimit({
	windowMs: CONFIG.RATE_LIMIT.page.windowMs,
	limit: CONFIG.RATE_LIMIT.page.limit,
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req) => ipKeyGenerator(req.ip),
	handler,
})

export { loginLimiter, apiLimiter, publicProfileLimiter, pageLimiter }
