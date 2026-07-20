import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiPost } from '../../hooks/useApi.js'
import './DualQuiz.css'


/**
 * Displays two entries side by side with 3 voting buttons (left/tie/right).
 * Posts the vote to /quiz/dual, then calls onVoted() so the caller can pick a
 * new pair — mirrors QUIZ.dual() + clickNewQuiz() from the legacy client.
 */
function DualQuiz() {
	const {userScores, refreshUserData} = useUserContext()
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

		/*
		 * Pick a second element at random. Assign a weight such as the more scores
		 * are similar with i1, the more chance it has to be picked. Every other
		 * entry keeps a (small) chance of being picked, so this never runs out of
		 * candidates even when every score is far apart from e1:
		 * - abs in [0, 0.25]: weight linearly interpolated from 10 (abs=0) to 1 (abs=0.25)
		 * - abs in [0.25, 2]: weight linearly interpolated from 0.1 (abs=0.25) to 0.001 (abs=2)
		 * - abs > 2: weight capped at 0.001
		 */
		function weightFor(abs) {
			if(abs <= 0.25) return 10 - 9*(abs/0.25)
			if(abs >= 2) return 0.001
			return 0.1 - 0.099*((abs-0.25)/1.75)
		}

		const candidates = []
		const w = []
		wsum = 0
		for(const s of options) {
			if(s.id === e1.id)
				continue
			const abs = Math.abs(e1.score - s.score)
			candidates.push(s)
			const _w = weightFor(abs)
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

	function pickNewPair(options) {
		const [l, r] = pickPair(options)
		setLeft(l)
		setRight(r)
		setIsVoting(false)
	}

	async function vote(value) {
		// Disable voting while the vote is being sent
		setIsVoting(true)
		try {
			await apiPost('/quiz/dual', {neg: left.id, value, pos: right.id})
			// Refresh first, then pick the next pair from the freshly updated scores
			const freshScores = await refreshUserData()
			pickNewPair(freshScores)
		} catch {
			pickNewPair(userScores)
		}
	}

	// Call pickNewPair once. Regular userScores refreshes (polling) must NOT
	// reshuffle the pair shown to the user - it would change the question
	// mid-thought. Only a vote or an explicit skip picks a new pair.
	useEffect(() => {
		pickNewPair(userScores)
	}, [])

	return (
		<div className="dual-quiz">
			{ left && right && (
				<table>
					<tr>
						<td className="dual-quiz-left">
							<img src={left.image}/><br/>
							<Link className="entryLabel" to={'/entry/' + left.id}>{left.label}</Link>
						</td>
						<td className="dual-quiz-right">
							<img src={right.image}/><br/>
							<Link className="entryLabel" to={'/entry/' + right.id}>{right.label}</Link>
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
							<button className="dual-quiz-skip" disabled={isVoting} onClick={() => pickNewPair(userScores)}>Skip</button>
						</td>
					</tr>
				</table>
			)}
		</div>
	)
}

export default DualQuiz
