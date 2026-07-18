import { Link } from 'react-router'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import './Header.css'

function Header({username, isAuthenticated, setScoreFormat, onOpenLogin, onLogOut}) {
	return (
		<header className="app-header">
			<Link to="/" className="app-header-link app-header-title">Nanking</Link>
			<div>
				Scores format:&nbsp;
				<select onChange={(e) => setScoreFormat(e.target.value)}>
					{Object.keys(FORMATTERS).map((format) => (
						<option key={format} value={format}>{format} ({FORMATTERS[format].pretty(0)}-{FORMATTERS[format].pretty(1)})</option>
					))}
				</select>
			</div>
			<div className="app-header-actions">
				{isAuthenticated ? (
					<>
						<Link to="/user/me" className="app-header-link app-header-username">{username}</Link>
						<button onClick={onLogOut}>Log out</button>
					</>
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
