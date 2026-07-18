import { useState } from 'react'
import './LoginModal.css'

const LOGIN_PATTERN = /^[a-zA-Z0-9_.\-]{4,20}$/
const PASSWORD_PATTERN = /^.{6,}$/

function LoginModal({initialMode, onLogin, onRegister, onClose}) {
	const [mode, setMode] = useState(initialMode)
	const [login, setLogin] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState(null)

	function switchMode(next) {
		setMode(next)
		setError(null)
	}

	async function handleSubmit(e) {
		e.preventDefault()
		if(!LOGIN_PATTERN.test(login) || !PASSWORD_PATTERN.test(password)) return

		try {
			setError(null)
			if(mode === 'login') await onLogin(login, password)
			else await onRegister(login, password)
		} catch(err) {
			setError(mode === 'login' ? 'Login failed' : 'Registration failed')
			console.warn(`${mode} failed`, err)
		}
	}

	return (
		<div className="login-modal-overlay" onClick={onClose}>
			<div className="login-modal-box" onClick={(e) => e.stopPropagation()}>
				<button type="button" className="login-modal-close" onClick={onClose}>×</button>
				<h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
				<form onSubmit={handleSubmit}>
					<p>Login: <input type="text" value={login} pattern={LOGIN_PATTERN.source}
						onChange={(e) => setLogin(e.target.value)}/> <span>(4-20 long, letters, digits, _, ., -)</span></p>
					<p>Password: <input type="password" value={password} pattern={PASSWORD_PATTERN.source}
						onChange={(e) => setPassword(e.target.value)}/> <span>(Minimum 6 long)</span></p>
					<button type="submit">{mode === 'login' ? 'Login' : 'Register'}</button>
				</form>
				{error && <p role="alert">{error}</p>}
				<p className="login-modal-switch">
					{mode === 'login'
						? <>No account? <button type="button" onClick={() => switchMode('register')}>Register</button></>
						: <>Already registered? <button type="button" onClick={() => switchMode('login')}>Login</button></>}
				</p>
			</div>
		</div>
	)
}

export default LoginModal
