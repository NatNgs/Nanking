import { useState } from 'react'
import './HomePage.css'

const LOGIN_PATTERN = /^[a-zA-Z0-9_.-]{4,20}$/
const PASSWORD_PATTERN = /^.{6,}$/

function HomePage({onLogin, onRegister}) {
	const [login, setLogin] = useState('')
	const [password, setPassword] = useState('')
	const [newLogin, setNewLogin] = useState('')
	const [newPassword, setNewPassword] = useState('')
	const [error, setError] = useState(null)

	async function handleLogin(e) {
		e.preventDefault()
		if(!LOGIN_PATTERN.test(login) || !PASSWORD_PATTERN.test(password)) return

		try {
			setError(null)
			await onLogin(login, password)
		} catch(err) {
			setError('Login failed')
			console.warn('Login failed', err)
		}
	}

	async function handleRegister(e) {
		e.preventDefault()
		if(!LOGIN_PATTERN.test(newLogin) || !PASSWORD_PATTERN.test(newPassword)) return

		try {
			setError(null)
			await onRegister(newLogin, newPassword)
		} catch(err) {
			setError('Registration failed')
			console.warn('Registration failed', err)
		}
	}

	return (
		<div>
			<form onSubmit={handleLogin}>
				<h2>Login</h2>
				<p>Login: <input type="text" value={login} pattern={LOGIN_PATTERN.source}
					onChange={(e) => setLogin(e.target.value)}/></p>
				<p>Password: <input type="password" value={password} pattern={PASSWORD_PATTERN.source}
					onChange={(e) => setPassword(e.target.value)}/></p>
				<button type="submit">Login</button>
			</form>
			<hr/>
			<form onSubmit={handleRegister}>
				<h2>Register</h2>
				<p>Login: <input type="text" value={newLogin} pattern={LOGIN_PATTERN.source}
					onChange={(e) => setNewLogin(e.target.value)}/> <span>(4-20 long, letters, digits, _, ., -)</span></p>
				<p>Password: <input type="password" value={newPassword} pattern={PASSWORD_PATTERN.source}
					onChange={(e) => setNewPassword(e.target.value)}/> <span>(Minimum 6 long)</span></p>
				<button type="submit">Register</button>
			</form>
			{error && <p role="alert">{error}</p>}
		</div>
	)
}

export default HomePage
