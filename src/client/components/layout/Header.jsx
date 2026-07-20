import { Link } from 'react-router'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import './Header.css'
import { useUserContext } from '../../context/UserContext.jsx'

function Header({setScoreFormat, onOpenLogin}) {
	const {username, logOut} = useUserContext()

	return (
		<header className="app-header">
			<Link to="/" className="app-header-link app-header-title">Nanking</Link>
			<div>
				Scores format:&nbsp;
				<select name="format" onChange={(e) => setScoreFormat(e.target.value)}>
					{Object.keys(FORMATTERS).map((format) => (
						<option key={format} value={format}>{format} ({FORMATTERS[format].pretty(0)}-{FORMATTERS[format].pretty(1)})</option>
					))}
				</select>
			</div>
			<div className="app-header-actions">
				{username ? (
					<>
						<Link to="/user/me" className="app-header-link app-header-username">{username}</Link>
						<button onClick={logOut}>Log out</button>
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
