import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router'
import { apiPost } from '../../hooks/useApi.js'
import './DualQuiz.css'


/**
 * Displays two entries side by side with 3 voting buttons (left/tie/right).
 * Posts the vote to /quiz/dual, then calls onVoted() so the caller can pick a
 * new pair — mirrors QUIZ.dual() + clickNewQuiz() from the legacy client.
 */
function DualQuiz() {
	const {userScores, setUserScores, scoreFormatter} = useOutletContext()
	const [isVoting, setIsVoting] = useState(true)
	const [left, setLeft] = useState(null)
	const [right, setRight] = useState(null)


	function pickPair(options) {
		/* Pick the first element at random. Assign a weight such as the more score it has, the more chance it has to be picked. */
		const f1 = (s)=>(s.score+1)
		let wsum = options.map(f1).reduce((a, b) => a + b, 0)
		let rnd = Math.random() * wsum
		let i1 = 0
		while(rnd > f1(options[i1])) {
			rnd -= f1(options[i1])
			i1++
		}
		const e1 = options[i1]

		/* Pick a second element at random. Assign a weight such as the more scores are similar with i1, the more chance it has to be picked. */
		const candidates = []
		const w = []
		wsum = 0
		for(const s of options) {
			if(s.id === e1.id)
				continue
			const abs = Math.abs(e1.score - s.score)
			if(abs > 0.25)
				continue // Too different
			candidates.push(s)
			const _w = 10 - 9*(abs/0.25) // abs=0 => w=10, abs=0.25 => w=1
			w.push(_w)
			wsum += _w
		}
		rnd = Math.random() * wsum
		let i2 = 0
		while(rnd > w[i2]) {
			rnd -= w[i2]
			i2++
		}
		const e2 = candidates[i2]

		return [e1, e2]
	}

	function pickNewPair() {
		const [l, r] = pickPair(userScores)
		setLeft(l)
		setRight(r)
		setIsVoting(false)
	}

	async function vote(value) {
		// Disable voting while the vote is being sent
		setIsVoting(true)
		try {
			await apiPost('/quiz/dual', {neg: left.id, vote: value, pos: right.id})
		} finally {
			pickNewPair()
		}
	}

	// Call pickNewPair once
	useEffect(() => {
		pickNewPair()
	}, [])

	return (
		<div className="dual-quiz">
			{ left && right && (
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
			)}
		</div>
	)
}

export default DualQuiz
