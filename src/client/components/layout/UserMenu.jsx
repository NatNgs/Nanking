import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router'
import './UserMenu.css'

/**
 * Username button styled like a Select, opening a dropdown with links to the
 * user's own public page and account options, plus the logout action
 * (formerly a standalone header button).
 */
function UserMenu({username, logOut}) {
	const [isOpen, setIsOpen] = useState(false)
	const rootRef = useRef(null)

	useEffect(() => {
		if(!isOpen) return
		function onPointerDown(e) {
			if(rootRef.current && !rootRef.current.contains(e.target)) setIsOpen(false)
		}
		function onKeyDown(e) {
			if(e.key === 'Escape') setIsOpen(false)
		}
		document.addEventListener('pointerdown', onPointerDown)
		document.addEventListener('keydown', onKeyDown)
		return () => {
			document.removeEventListener('pointerdown', onPointerDown)
			document.removeEventListener('keydown', onKeyDown)
		}
	}, [isOpen])

	function closeAnd(fn) {
		return () => {
			setIsOpen(false)
			fn?.()
		}
	}

	return (
		<div className="user-menu" ref={rootRef}>
			<div className="user-menu-trigger" onClick={() => setIsOpen((v) => !v)}>
				{username}
			</div>
			{isOpen && (
				<div className="user-menu-dropdown">
					<Link to={'/user/' + username} className="user-menu-item" onClick={closeAnd()}>My public page</Link>
					<Link to="/user/me" className="user-menu-item" onClick={closeAnd()}>Options</Link>
					<button type="button" className="user-menu-item" onClick={closeAnd(logOut)}>Log out</button>
				</div>
			)}
		</div>
	)
}

export default UserMenu
