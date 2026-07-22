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
		const trimmedLogin = login.trim()
		setError(null)
		if(mode === 'login') {
			if(!trimmedLogin || !password) {
				setError('Login or password is empty')
				return
			}
			if(!LOGIN_PATTERN.test(trimmedLogin) || !PASSWORD_PATTERN.test(password)) {
				setError('Login failed')
				return
			}
			try {
				await onLogin(trimmedLogin, password)
			} catch(err) {
				setError('Login failed')
				return
			}
		} else {
			if(!LOGIN_PATTERN.test(trimmedLogin)) {
				setError('Invalid username')
				return
			}
			if(!PASSWORD_PATTERN.test(password)) {
				setError('Password is not long enough')
				return
			}
			try {
				await onRegister(trimmedLogin, password)
			} catch(err) {
				console.warn('Registration failed', err)
				setError('Registration failed')
			}
		}
	}

	return (
		<div className="login-modal-overlay" onClick={onClose}>
			<div className="login-modal-box" onClick={(e) => e.stopPropagation()}>
				<button type="button" className="login-modal-close" onClick={onClose}>×</button>
				<h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
				<form onSubmit={handleSubmit}>
					<table>
						<tr>
							<td>Username:</td>
							<td>
								<input type="text" value={login}
									title="Username must be from 4 to 20 long. Allowed characters are: a-z A-Z 0-9 _ . - only"
									onChange={(e) => setLogin(e.target.value)}/>
							</td>
						</tr>
						<tr>
							<td colspan="2"><div class="login-hint">4 to 20 long, Allowed: a-z A-Z 0-9 _ . -</div></td>
						</tr>
						<tr>
							<td>Password:</td>
							<td>
								<input type="password" value={password}
									title="Password must not be empty"
									onChange={(e) => setPassword(e.target.value)}/>
							</td>
						</tr>
						<tr>
							<td colspan="2"><div class="login-hint">Minimum 6 long</div></td>
						</tr>
						<tr>
							<td colspan="2" className="login-modal-submit">
								<button type="submit">{mode === 'login' ? 'Login' : 'Create a new account'}</button>
							</td>
						</tr>
					</table>
				</form>
				{error && <p role="login-alert" class="login-modal-error">{error}</p>}
				<hr/>
				<p className="login-modal-switch">
					{mode === 'login'
						? <>No account?<br/><a href="#" onClick={() => switchMode('register')}>Create a new account here</a></>
						: <>Already registered?<br/><a href="#" onClick={() => switchMode('login')}>Login here</a></>}
				</p>
			</div>
		</div>
	)
}

export default LoginModal
