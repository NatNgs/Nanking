import { Link } from 'react-router'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import './Header.css'
import { useUserContext } from '../../context/UserContext.jsx'
import UserMenu from './UserMenu.jsx'

function Header({scoreFormat, setScoreFormat, onOpenLogin}) {
	const {username, logOut} = useUserContext()

	return (
		<header className="app-header">
			<Link to="/" className="app-header-link app-header-title">Nanking</Link>
			<div className="app-header-actions">
				<div className="app-header-labelled">
					<label htmlFor="header-score-format">Scores format:</label>
					<select
						id="header-score-format" name="format" value={scoreFormat}
						onChange={(e) => setScoreFormat(e.target.value)}
					>
						{Object.keys(FORMATTERS).map((format) => (
							<option key={format} value={format}>
								{format} ({FORMATTERS[format].pretty(0)}-{FORMATTERS[format].pretty(1)})
							</option>
						))}
					</select>
				</div>
				{username ? (
					<UserMenu username={username} logOut={logOut} />
				) : (
					<>
						<button onClick={() => onOpenLogin('login')}>Login</button>
						<button onClick={() => onOpenLogin('register')}>Register</button>
					</>
				)}
			</div>
		</header>
	)
}

export default Header
