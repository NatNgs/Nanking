import { createBrowserRouter } from 'react-router'
import Layout from './components/layout/Layout.jsx'
import MainPage from './pages/main/MainPage.jsx'
import DualQuiz from './components/quiz/DualQuiz.jsx'
import ProfilePage, { profileLoader } from './pages/profile/ProfilePage.jsx'
import AccountPage from './pages/account/AccountPage.jsx'
import EntryPage, { entryLoader } from './pages/entry/EntryPage.jsx'
import TagPage, { tagLoader } from './pages/tag/TagPage.jsx'
import ErrorPage from './pages/error/ErrorPage.jsx'

const router = createBrowserRouter([
	{
		element: <Layout />,
		errorElement: <ErrorPage />,
		children: [
			{ path: '/', element: <MainPage />, errorElement: <ErrorPage /> },
			{ path: '/quiz/dual', element: <DualQuiz />, errorElement: <ErrorPage /> },
			{ path: '/user/me', element: <AccountPage />, errorElement: <ErrorPage /> },
			{ path: '/user/:username', element: <ProfilePage />, loader: profileLoader, errorElement: <ErrorPage /> },
			{ path: '/entry/:entryId', element: <EntryPage />, loader: entryLoader, errorElement: <ErrorPage /> },
			{ path: '/tag/:tagId', element: <TagPage />, loader: tagLoader, errorElement: <ErrorPage /> },
			{ path: '*', element: <ErrorPage /> },
		],
	},
])

export default router
