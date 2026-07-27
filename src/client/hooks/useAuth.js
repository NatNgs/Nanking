import { useState, useEffect, useCallback } from 'react'
import jsSHA from 'jssha'
import { apiGet, apiPost, setUnauthorizedHandler } from './useApi.js'

/**
 * Hashes the password client-side before it ever reaches the network, salted with
 * the login (always lowercased, regardless of how the user typed it) and a fixed
 * constant. Used identically by login() and register(), so an account created as
 * "Bobby" and later logged into as "BOBBY" or "bobby" hashes to the same value.
 */
function hashPassword(login, pwd) {
	return new jsSHA('SHA-512', 'TEXT', login.trim().toLowerCase())
		.update(pwd)
		.update('Nanking')
		.getHash('B64')
}

function useAuth() {
	const [isAuthenticated, setIsAuthenticated] = useState(false)
	const [isLoading, setIsLoading] = useState(true)

	// With a HttpOnly session cookie, the client can no longer inspect its
	// presence directly - the only way to know whether a session is already
	// active (e.g. page reload) is to ask the server.
	useEffect(() => {
		let cancelled = false
		apiGet('/user/me')
			.then((data) => { if(!cancelled) setIsAuthenticated(!!data) })
			.catch(() => { if(!cancelled) setIsAuthenticated(false) })
			.finally(() => { if(!cancelled) setIsLoading(false) })
		return () => { cancelled = true }
	}, [])

	// Degrades to the logged-out state on any 401 from any API call (expired
	// session), instead of the apiFetch fallback (alert + full page reload).
	useEffect(() => {
		setUnauthorizedHandler(() => setIsAuthenticated(false))
		return () => setUnauthorizedHandler(null)
	}, [])

	const login = useCallback(async (rawLogin, pwd) => {
		const pwdHash = hashPassword(rawLogin, pwd)
		await apiPost('/login', {login: rawLogin.trim(), pwd: pwdHash})
		setIsAuthenticated(true)
	}, [])

	const register = useCallback(async (rawLogin, pwd) => {
		const pwdHash = hashPassword(rawLogin, pwd)
		await apiPost('/login', {login: rawLogin.trim(), pwd: pwdHash, new: 'true'})
		setIsAuthenticated(true)
	}, [])

	const logOut = useCallback(async () => {
		await apiPost('/logout')
		setIsAuthenticated(false)
	}, [])

	return {isAuthenticated, isLoading, login, register, logOut}
}

export { useAuth, hashPassword }
