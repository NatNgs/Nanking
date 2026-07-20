import { Link, useRouteError, isRouteErrorResponse, useLocation } from 'react-router'
import './ErrorPage.css'

function ErrorPage() {
	const error = useRouteError()
	const location = useLocation()
	const isUnknownUser = isRouteErrorResponse(error) && error.status === 404 && error.data === 'user'
	const isUnknownEntry = isRouteErrorResponse(error) && error.status === 404 && error.data === 'entry'

	const title = isUnknownUser ? 'User not found'
		: isUnknownEntry ? 'Entry not found'
		: location.state?.message ? 'Error'
		: 'Page not found'
	const message = isUnknownUser ? 'This user does not exist.'
		: isUnknownEntry ? 'This entry does not exist.'
		: location.state?.message || 'The page you are looking for does not exist.'

	return (
		<div className="error-page">
			<h2>{title}</h2>
			<p>{message}</p>
			<Link to="/">Back to home</Link>
		</div>
	)
}

export default ErrorPage
