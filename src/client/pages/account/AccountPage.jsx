import { useState } from 'react'
import { Navigate, Link, useOutletContext } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import DeleteAccountModal from '../../components/account/DeleteAccountModal.jsx'
import { apiDelete } from '../../hooks/useApi.js'
import './AccountPage.css'

function AccountPage() {
	const {isAuthenticated, username, userScores, userVotes, logOut, refreshUserData} = useUserContext()
	const {scoreFormatter} = useOutletContext()
	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

	if(!isAuthenticated) return <Navigate to="/" replace />

	async function onClickDelete(voteData) {
		/* Disable all buttons on the row of id <rowId> */
		document.querySelectorAll('#' + voteData.id + ' .voteDetail button').forEach(b => b.disabled = true)
		/* Add class "beingDeleted" to the row */
		document.getElementById(voteData.id).classList.add('beingDeleted')

		/* Call api delete("/quiz/<type>") with body from userVotes */
		await apiDelete('/quiz/' + voteData.type, voteData)

		/* if success, call userContext to refresh userData to trigger redisplay of the table */
		await refreshUserData()
	}

	// Prepare vote list to be diaplayed
	function getVotes() {
		return userVotes.map((vote, i) => ({
			...vote,
			id: // hash the vote data to get a unique id
				(vote.type === 'default'
					? ['default', vote.entry]
					: ['dual', vote.neg, vote.pos]
				).join('_').replaceAll(/[^a-zA-Z0-9_]+/g, ''),
		}))
	}

	return (
		<div className="account-page">
			<h1>{username}</h1>
			<Link to={'/user/' + username}>My public user page</Link>
			<br/>
			<h2>My inputs</h2>
			<table>
				<thead>
					<th>Type</th>
					<th>Detail</th>
					<th>Actions</th>
				</thead>
				<tbody>
				{getVotes().map((vote) => (
					<tr key={vote.id} id={vote.id}>
						<td>{vote.type}</td>
						<td>
							<div class="voteDetail">{vote.type === 'default'
								? (<><span className="entryLabel" title={userScores.find(s => s.id === vote.entry).label}>{userScores.find(s => s.id === vote.entry).label}</span> =&gt; <span className="entryScore">{scoreFormatter.pretty(vote.value)}</span></>)
								: (<>
								<span className="entryLabel" title={userScores.find(s => s.id === vote.neg).label}>{userScores.find(s => s.id === vote.neg).label}</span> <span className="dualOperator">{vote.value < 0 ? '>' : vote.value === 0 ? '=' : '<'}</span> <span className="entryLabel" title={userScores.find(s => s.id === vote.pos).label}>{userScores.find(s => s.id === vote.pos).label}</span>
								</>)
							}</div>
						</td>
						<td class="actionsCol"><button onClick={() => onClickDelete(vote)} class="deleteButton">🗙</button></td>
					</tr>
				))}
				</tbody>
			</table>
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
