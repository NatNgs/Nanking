import './Header.css'

function Header({username, isAuthenticated, onOpenLogin, onLogOut}) {
	return (
		<header className="app-header">
			<span className="app-header-title">Nanking</span>
			<div className="app-header-actions">
				{isAuthenticated ? (
					<>
						<span className="app-header-username">{username}</span>
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
