import { createBrowserRouter } from 'react-router'
import Layout from './components/layout/Layout.jsx'
import MainPage from './pages/main/MainPage.jsx'
import ProfilePage, { profileLoader } from './pages/profile/ProfilePage.jsx'
import AccountPage from './pages/account/AccountPage.jsx'
import ErrorPage from './pages/error/ErrorPage.jsx'

const router = createBrowserRouter([
	{
		element: <Layout />,
		errorElement: <ErrorPage />,
		children: [
			{ path: '/', element: <MainPage /> },
			{ path: '/user/me', element: <AccountPage /> },
			{ path: '/user/:username', element: <ProfilePage />, loader: profileLoader },
			{ path: '*', element: <ErrorPage /> },
		],
	},
])

export default router
