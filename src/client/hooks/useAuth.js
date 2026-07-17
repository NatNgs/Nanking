import { useState, useEffect, useCallback } from 'react'
import jsSHA from 'jssha'
import { apiPost } from './useApi.js'

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

	useEffect(() => {
		if(!window.localStorage.getItem('token')) {
			setIsLoading(false)
			return
		}

		// Revalidate the existing token (auto-login), like init() used to do
		apiPost('/login', {})
			.then(() => setIsAuthenticated(true))
			.catch(() => window.localStorage.removeItem('token'))
			.finally(() => setIsLoading(false))
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

	const logOut = useCallback(() => {
		window.localStorage.removeItem('token')
		setIsAuthenticated(false)
	}, [])

	return {isAuthenticated, isLoading, login, register, logOut}
}

export { useAuth }
