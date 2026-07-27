import { useState } from 'react'
import { hashPassword } from '../../hooks/useAuth.js'
import { apiDelete } from '../../hooks/useApi.js'
import { useUserContext } from '../../context/UserContext.jsx'
import { useModalA11y } from '../../hooks/useModalA11y.js'
import './DeleteAccountModal.css'

function DeleteAccountModal({onClose, onDeleted}) {
	const {username} = useUserContext()
	const [password, setPassword] = useState('')
	const [error, setError] = useState(null)
	const boxRef = useModalA11y(onClose)

	async function handleSubmit(e) {
		e.preventDefault()
		try {
			setError(null)
			await apiDelete('/user/me', {pwd: hashPassword(username, password)})
			onDeleted()
		} catch (err) {
			setError('Wrong password')
			console.warn('Account deletion failed', err)
		}
	}

	return (
		<div className="delete-account-modal-overlay" onClick={onClose}>
			<div
				className="delete-account-modal-box" ref={boxRef} role="dialog"
				aria-modal="true" tabIndex={-1} onClick={(e) => e.stopPropagation()}
			>
				<button type="button" className="delete-account-modal-close" onClick={onClose}>×</button>
				<h2>Remove my account</h2>
				<p>This will <span style={{color: 'red'}}>permanently</span> delete your account and all of your data.</p>
				<p>Confirm your password to proceed:</p>
				<form onSubmit={handleSubmit}>
					<p>
						<label htmlFor="delete-account-password">Password:</label>{' '}
						<input id="delete-account-password" type="password" value={password}
							onChange={(e) => setPassword(e.target.value)}/>
					</p>
					<button type="submit">Remove my account</button>
				</form>
				{error && <p role="alert">{error}</p>}
			</div>
		</div>
	)
}

export default DeleteAccountModal
