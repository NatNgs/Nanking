import { useState, useMemo, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { setUnauthorizedHandler } from '../../hooks/useApi.js'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import Header from './Header.jsx'
import LoginModal from '../auth/LoginModal.jsx'
import ErrorPage from '../../pages/error/ErrorPage.jsx'

import './Layout.css'

/**
 * Shared route layout: mounts the fixed Header (always visible, connected or
 * not) and the login/register modal, and exposes non-user data (score format)
 * to child routes via the router's outlet context. Auth/user data itself
 * comes from UserContext, not the outlet context.
 */
function Layout() {
	const {login, register, logOut} = useUserContext()
	const location = useLocation()
	const [loginModalMode, setLoginModalMode] = useState(null) // null | 'login' | 'register'
	const [sessionExpiredMessage, setSessionExpiredMessage] = useState(null)

	// Registered once: replaces useApi's default alert+reload fallback on an
	// expired/invalid session with a plain logout + local error state,
	// preserving the current URL and in-progress React state instead of a
	// full page reload or a navigation to a dedicated /error route.
	useEffect(() => {
		setUnauthorizedHandler(() => {
			logOut()
			setSessionExpiredMessage('Your session has expired. Please log in again.')
		})
	}, [logOut])

	// Clear the error display whenever the user navigates away, so it does
	// not resurface after a refresh or a route change.
	useEffect(() => {
		setSessionExpiredMessage(null)
	}, [location.pathname])

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
				scoreFormat={scoreFormat}
				setScoreFormat={setScoreFormat}
				onOpenLogin={setLoginModalMode}
			/>
			<div className="main-page-content">
				{sessionExpiredMessage
					? <ErrorPage message={sessionExpiredMessage} />
					: <Outlet context={{scoreFormatter}}/>}
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
