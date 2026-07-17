import { Link, useRouteError, isRouteErrorResponse } from 'react-router'
import './ErrorPage.css'

function ErrorPage() {
	const error = useRouteError()
	const isUnknownUser = isRouteErrorResponse(error) && error.status === 404 && error.data === 'user'

	return (
		<div className="error-page">
			<h2>{isUnknownUser ? 'User not found' : 'Page not found'}</h2>
			<p>{isUnknownUser ? 'This user does not exist.' : 'The page you are looking for does not exist.'}</p>
			<Link to="/">Back to home</Link>
		</div>
	)
}

export default ErrorPage
