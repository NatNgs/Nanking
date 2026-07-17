import { Routes, Route } from 'react-router'
import { useAuth } from './hooks/useAuth.js'
import HomePage from './pages/home/HomePage.jsx'
import MainPage from './pages/main/MainPage.jsx'

/**
 * Renders HomePage or MainPage depending on whether the user is authenticated.
 * Both are reached through the same "/" route today; as more pages are added,
 * they get their own <Route> entries here rather than replacing this pattern.
 */
function RootRoute() {
	const auth = useAuth()

	if(auth.isLoading) return null
	return auth.isAuthenticated
		? <MainPage onLogOut={auth.logOut} />
		: <HomePage onLogin={auth.login} onRegister={auth.register} />
}

function App() {
	return (
		<Routes>
			<Route path="/" element={<RootRoute />} />
		</Routes>
	)
}

export default App
