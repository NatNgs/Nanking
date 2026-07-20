import { useState, useMemo } from 'react'
import { Outlet } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import Header from './Header.jsx'
import LoginModal from '../auth/LoginModal.jsx'
import EntriesPanel from '../../components/entries/EntriesPanel.jsx'

import './Layout.css'

/**
 * Shared route layout: mounts the fixed Header (always visible, connected or
 * not) and the login/register modal, and exposes non-user data (score format)
 * to child routes via the router's outlet context. Auth/user data itself
 * comes from UserContext, not the outlet context.
 */
function Layout() {
	const {isAuthenticated, login, register} = useUserContext()
	const [loginModalMode, setLoginModalMode] = useState(null) // null | 'login' | 'register'

	const [isPanelOpen, setIsPanelOpen] = useState(isAuthenticated)

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
			<div class={'main-page-content ' + (isPanelOpen ? 'panel-open ' : 'panel-closed ')}>
			<Outlet context={{scoreFormatter}}/>
			</div>
			{isAuthenticated && (
				// No panel if viewport is less than 1000px wide

				<EntriesPanel
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
