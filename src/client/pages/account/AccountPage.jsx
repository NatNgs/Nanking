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
			<Link to={'/user/' + username}>My public user page</Link><br/><br/>
			<button onClick={() => setIsDeleteModalOpen(true)}>Remove my account</button>
			<br/>
			<h2>User log</h2>
			<p>Here are displayed all the scores given to your entries. Removing lines will cancel them, and so modify your scores.</p>
			<RecentVotesTable scoreFormatter={scoreFormatter} showRank showPagination />
			<br/>
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
