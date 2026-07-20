import { useState } from 'react'
import { Navigate, Link } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'
import './AccountPage.css'

function AccountPage() {
	const {isAuthenticated, username, userScores, userVotes, logOut} = useUserContext()
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

	if(!isAuthenticated) return <Navigate to="/" replace />

	return (
		<div className="account-page">
			<h1>{username}</h1>
			<Link to={'/user/' + username}>My public user page</Link>
			<hr/>
			<h2>My inputs</h2>
			<ul>
				{userVotes.map((vote, i) => (
					<li key={i}>
						{vote.type}: {vote.type === 'default'
							? `${userScores.find(s => s.id === vote.entry).label} = ${vote.value}`
							: `${userScores.find(s => s.id === vote.neg).label} ${vote.value < 0 ? '>' : vote.value === 0 ? '=' : '<'} ${userScores.find(s => s.id === vote.pos).label}`
						}
					</li>
				))}
			</ul>
			<hr/>
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
