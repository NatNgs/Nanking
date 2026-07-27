import { Link, useRouteError, isRouteErrorResponse, useLocation } from 'react-router'
import './ErrorPage.css'

function ErrorPage({message: messageProp} = {}) {
	const error = useRouteError()
	const location = useLocation()
	const isUnknownUser = isRouteErrorResponse(error) && error.status === 404 && error.data === 'user'
	const isUnknownEntry = isRouteErrorResponse(error) && error.status === 404 && error.data === 'entry'
	const stateMessage = messageProp || location.state?.message

	let title, message
	if(isUnknownUser) {
		title = 'User not found'
		message = 'This user does not exist.'
	} else if(isUnknownEntry) {
		title = 'Entry not found'
		message = 'This entry does not exist.'
	} else if(stateMessage) {
		title = 'Error'
		message = stateMessage
	} else {
		title = 'Page not found'
		message = 'The page you are looking for does not exist.'
	}

	return (
		<div className="error-page">
			<h2>{title}</h2>
			<p>{message}</p>
			<Link to="/">Back to home</Link>
		</div>
	)
}

export default ErrorPage
