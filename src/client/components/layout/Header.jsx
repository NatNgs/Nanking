import { Link } from 'react-router'
import './Header.css'

function Header({username, isAuthenticated, onOpenLogin, onLogOut}) {
	return (
		<header className="app-header">
			<Link to="/" className="app-header-link app-header-title">Nanking</Link>
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
