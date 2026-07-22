import { useState } from 'react'
import { Navigate, Link, useOutletContext } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'
import RecentVotesTable from '../../components/quiz/RecentVotesTable.jsx'
import './AccountPage.css'

function AccountPage() {
	const {isAuthenticated, username, logOut} = useUserContext()
	const {scoreFormatter} = useOutletContext()
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

	if(!isAuthenticated) return <Navigate to="/" replace />

	return (
		<div className="account-page">
			<h1>{username}</h1>
			<Link to={'/user/' + username}>My public user page</Link>
			<br/>
			<h2>My inputs</h2>
			<RecentVotesTable scoreFormatter={scoreFormatter} showRank showPagination />
			<br/>
			<button onClick={() => setIsDeleteModalOpen(true)}>Remove my account</button>
			{isDeleteModalOpen && (
				<DeleteAccountModal
					onClose={() => setIsDeleteModalOpen(false)}
					onDeleted={logOut}
				/>
			)}
		</div>
	)
}

export default AccountPage
