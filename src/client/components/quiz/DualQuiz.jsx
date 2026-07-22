import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiGet, apiPost } from '../../hooks/useApi.js'
import EntrySpan from '../entry/EntrySpan.jsx'
import RecentVotesTable from './RecentVotesTable.jsx'
import './DualQuiz.css'

/**
 * Displays two entries side by side with 3 voting buttons (left/tie/right).
 * The pair itself is picked server-side (GET /api/quiz/dual, weighted by
 * score proximity — see src/server/services/dualQuizService.js), so this
 * component never needs the full user score list.
 */
function DualQuiz() {
	const {scoreFormatter} = useOutletContext()
	const {refreshUserData, bumpEntriesVersion} = useUserContext()
	const [isVoting, setIsVoting] = useState(true)
	const [left, setLeft] = useState(null)
	const [right, setRight] = useState(null)
	const [error, setError] = useState(null)

	async function fetchNewPair() {
		setIsVoting(true)
		try {
			const pair = await apiGet('/quiz/dual')
			setLeft(pair.left)
			setRight(pair.right)
			setError(null)
		} catch(err) {
			setError(err)
		} finally {
			setIsVoting(false)
		}
	}

	async function vote(value) {
		// Disable voting while the vote is being sent
		setIsVoting(true)
		try {
			await apiPost('/quiz/dual', {neg: left.id, value, pos: right.id})
			await refreshUserData()
			bumpEntriesVersion()
		} finally {
			await fetchNewPair()
		}
	}

	// Fetch a pair once on mount. Only a vote or an explicit skip picks a new
	// pair afterwards.
	useEffect(() => {
		fetchNewPair()
	}, [])

	return (
		<div className="dual-quiz">
			{error && <p role="alert">Not enough scored entries yet for a duel.</p>}
			{ left && right && (
				<table className="dual-quiz-pair-table">
					<tr>
						<td className="dual-quiz-left">
							<img src={'/api/entry/' + left.id + '/image.png'}/><br/>
							<EntrySpan id={left.id} label={left.label} />
						</td>
						<td className="dual-quiz-right">
							<img src={'/api/entry/' + right.id + '/image.png'}/><br/>
							<EntrySpan id={right.id} label={right.label} />
						</td>
					</tr>
					<tr>
						<td colSpan="2">
							<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(-1)}>^ Choose</button>
							<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(0)}>No Best</button>
							<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(1)}>Choose ^</button>
						</td>
					</tr>
					<tr>
						<td colSpan="2">
							<button className="dual-quiz-skip" disabled={isVoting} onClick={fetchNewPair}>Skip</button>
						</td>
					</tr>
				</table>
			)}
			<RecentVotesTable scoreFormatter={scoreFormatter} type="dual" limit={5} />
		</div>
	)
}

export default DualQuiz
