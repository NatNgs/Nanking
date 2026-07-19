import { useState, useMemo } from 'react'
import { Outlet } from 'react-router'
import { useAuth } from '../../hooks/useAuth.js'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import Header from './Header.jsx'
import LoginModal from '../auth/LoginModal.jsx'
import EntriesPanel from '../../components/entries/EntriesPanel.jsx'

import './Layout.css'

/**
 * Shared route layout: mounts the fixed Header (always visible, connected or
 * not) and the login/register modal, and exposes user data to child routes
 * via the router's outlet context.
 */
function Layout() {
	const auth = useAuth()
	const {username, userScores, setUserScores} = useCurrentUser(auth.isAuthenticated)
	const [loginModalMode, setLoginModalMode] = useState(null) // null | 'login' | 'register'

	const [isPanelOpen, setIsPanelOpen] = useState(auth.isAuthenticated)

	const [scoreFormat, setScoreFormat] = useState('Percent')
	const scoreFormatter = useMemo(() => FORMATTERS[scoreFormat], [scoreFormat])

	async function handleLogin(rawLogin, pwd) {
		await auth.login(rawLogin, pwd)
		setLoginModalMode(null)
	}
	async function handleRegister(rawLogin, pwd) {
		await auth.register(rawLogin, pwd)
		setLoginModalMode(null)
	}
	return (
		<>
			<Header
				username={username}
				isAuthenticated={auth.isAuthenticated}
				setScoreFormat={setScoreFormat}
				onOpenLogin={setLoginModalMode}
				onLogOut={auth.logOut}
			/>
			<div class={'main-page-content ' + (isPanelOpen ? 'panel-open ' : 'panel-closed ')}>
			<Outlet context={{
				username,
				userScores,
				setUserScores,
				scoreFormatter,
				isAuthenticated: auth.isAuthenticated,
			}}/>
			</div>
			{auth.isAuthenticated && (
				<EntriesPanel
					userScores={userScores}
					setUserScores={setUserScores}
					scoreFormatter={scoreFormatter}
					isOpen={isPanelOpen}
					onToggle={() => setIsPanelOpen((v) => !v)}
				/>
			)}

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
