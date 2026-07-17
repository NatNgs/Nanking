import { Routes, Route } from 'react-router'
import Layout from './components/layout/Layout.jsx'
import MainPage from './pages/main/MainPage.jsx'
import ErrorPage from './pages/error/ErrorPage.jsx'

function App() {
	return (
		<Routes>
			<Route element={<Layout />}>
				<Route path="/" element={<MainPage />} />
				<Route path="*" element={<ErrorPage />} />
			</Route>
		</Routes>
	)
}

export default App
