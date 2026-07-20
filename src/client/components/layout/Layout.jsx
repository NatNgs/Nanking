import { useState, useMemo, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { setUnauthorizedHandler } from '../../hooks/useApi.js'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import Header from './Header.jsx'
import LoginModal from '../auth/LoginModal.jsx'

import './Layout.css'

/**
 * Shared route layout: mounts the fixed Header (always visible, connected or
 * not) and the login/register modal, and exposes non-user data (score format)
 * to child routes via the router's outlet context. Auth/user data itself
 * comes from UserContext, not the outlet context.
 */
function Layout() {
	const {login, register, logOut} = useUserContext()
	const navigate = useNavigate()
	const [loginModalMode, setLoginModalMode] = useState(null) // null | 'login' | 'register'

	// Registered once: replaces useApi's default alert+reload fallback on an
	// expired/invalid session with a plain logout + navigation to the error
	// page, preserving in-progress React state instead of a full page reload.
	useEffect(() => {
		setUnauthorizedHandler(() => {
			logOut()
			navigate('/error', {state: {message: 'Your session has expired. Please log in again.'}})
		})
	}, [logOut, navigate])

	const [scoreFormat, setScoreFormat] = useState('Percent')
	const scoreFormatter = useMemo(() => FORMATTERS[scoreFormat], [scoreFormat])

	async function handleLogin(rawLogin, pwd) {
		await login(rawLogin, pwd)
		setLoginModalMode(null)
	}
	async function handleRegister(rawLogin, pwd) {
		await register(rawLogin, pwd)
		setLoginModalMode(null)
	}
	return (
		<>
			<Header
				setScoreFormat={setScoreFormat}
				onOpenLogin={setLoginModalMode}
			/>
			<div className="main-page-content">
			<Outlet context={{scoreFormatter}}/>
			</div>

			{loginModalMode && (
				<LoginModal
					initialMode={loginModalMode}
					onLogin={handleLogin}
					onRegister={handleRegister}
					onClose={() => setLoginModalMode(null)}
				/>
			)}
		</>
	)
}

export default Layout
