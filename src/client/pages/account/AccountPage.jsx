import { useState } from 'react'
import { useOutletContext, Navigate, Link } from 'react-router'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'
import './AccountPage.css'

function AccountPage() {
	const {username, isAuthenticated} = useOutletContext()
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

	if(!isAuthenticated) return <Navigate to="/" replace />

	return (
		<div className="account-page">
			<h1>{username}</h1>
			<Link to={'/user/' + username}>My public user page</Link>
			<button onClick={() => setIsDeleteModalOpen(true)}>Remove my account</button>
			{isDeleteModalOpen && (
				<DeleteAccountModal
					username={username}
					onClose={() => setIsDeleteModalOpen(false)}
					onDeleted={() => { window.localStorage.removeItem('token'); window.location.href = '/' }}
				/>
			)}
		</div>
	)
}

export default AccountPage
