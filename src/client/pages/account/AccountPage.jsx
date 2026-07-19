import { useState, useEffect } from 'react'
import { useOutletContext, Navigate, Link } from 'react-router'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'
import './AccountPage.css'

function AccountPage() {
	const {isAuthenticated} = useOutletContext()
	const {username, userScores, userVotes, refreshUserData} = useCurrentUser()
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
							? `${userScores.find(s => s.id === vote.entry).name} = ${vote.score}`
							: `${userScores.find(s => s.id === vote.neg).name} ${vote.value < 0 ? '>' : vote.value === 0 ? '=' : '<'} ${userScores.find(s => s.id === vote.pos).name}`
						}
					</li>
				))}
			</ul>
			<hr/>
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
