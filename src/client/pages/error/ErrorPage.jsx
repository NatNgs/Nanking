import { Link } from 'react-router'
import './ErrorPage.css'

function ErrorPage() {
	return (
		<div className="error-page">
			<h2>Page not found</h2>
			<p>The page you are looking for does not exist.</p>
			<Link to="/">Back to home</Link>
		</div>
	)
}

export default ErrorPage
