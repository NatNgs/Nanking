import { useState } from 'react'
import { apiPost } from '../../hooks/useApi.js'
import './DualQuiz.css'

/**
 * Displays two entries side by side with 3 voting buttons (left/tie/right).
 * Posts the vote to /quiz/dual, then calls onVoted() so the caller can pick a
 * new pair — mirrors QUIZ.dual() + clickNewQuiz() from the legacy client.
 */
function DualQuiz({left, right, onVoted}) {
	const [isVoting, setIsVoting] = useState(false)

	async function vote(value) {
		setIsVoting(true)
		try {
			await apiPost('/quiz/dual', {neg: left.id, vote: value, pos: right.id})
		} finally {
			setIsVoting(false)
			onVoted()
		}
	}

	return (
		<div className="dual-quiz">
			<table>
				<tr>
					<td className="dual-quiz-left">
						<img src={left.image}/><br/>
						<div>{left.label}</div>
					</td>
					<td className="dual-quiz-right">
						<img src={right.image}/><br/>
						<div>{right.label}</div>
					</td>
				</tr>
				<tr>
					<td colSpan="2">
						<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(-1)}>^ Choose</button>
						<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(0)}>No Best</button>
						<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(1)}>Choose ^</button>
					</td>
				</tr>
			</table>
		</div>
	)
}

export default DualQuiz
