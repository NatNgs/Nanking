import { useState } from 'react'
import { hashPassword } from '../../hooks/useAuth.js'
import { apiDelete } from '../../hooks/useApi.js'
import { useUserContext } from '../../context/UserContext.jsx'
import './DeleteAccountModal.css'

function DeleteAccountModal({onClose, onDeleted}) {
	const {username} = useUserContext()
	const [password, setPassword] = useState('')
	const [error, setError] = useState(null)

	async function handleSubmit(e) {
		e.preventDefault()
		try {
			setError(null)
			await apiDelete('/user/me', {pwd: hashPassword(username, password)})
			onDeleted()
		} catch(err) {
			setError('Wrong password')
			console.warn('Account deletion failed', err)
		}
	}

	return (
		<div className="delete-account-modal-overlay" onClick={onClose}>
			<div className="delete-account-modal-box" onClick={(e) => e.stopPropagation()}>
				<button type="button" className="delete-account-modal-close" onClick={onClose}>×</button>
				<h2>Remove my account</h2>
				<p>This will permanently delete your account and all of your data. Confirm your password to proceed.</p>
				<form onSubmit={handleSubmit}>
					<p>Password: <input type="password" value={password}
						onChange={(e) => setPassword(e.target.value)}/></p>
					<button type="submit">Remove my account</button>
				</form>
				{error && <p role="alert">{error}</p>}
			</div>
		</div>
	)
}

export default DeleteAccountModal
