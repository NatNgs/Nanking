import { useState, useEffect, useMemo, useCallback } from 'react'
import { apiGet, apiPut } from '../../hooks/useApi.js'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import DualQuiz from '../../components/dual/DualQuiz.jsx'
import './MainPage.css'

function pickPair(options) {
	const i1 = Math.floor(Math.random() * options.length)
	let i2 = Math.floor(Math.random() * (options.length - 1))
	if(i2 >= i1) i2++
	return [options[i1], options[i2]]
}

function MainPage({onLogOut}) {
	const [username, setUsername] = useState('')
	const [userScores, setUserScores] = useState([])
	const [scoreFormatKey, setScoreFormatKey] = useState('Percent')
	const [newEntryName, setNewEntryName] = useState('')
	const [newEntryScore, setNewEntryScore] = useState(10)
	const [quizPair, setQuizPair] = useState(null)
	const [quizMessage, setQuizMessage] = useState('')

	const formatter = useMemo(() => FORMATTERS[scoreFormatKey], [scoreFormatKey])

	const refreshUserData = useCallback(() => {
		apiGet('/user/me').then((data) => {
			setUsername(data.username)
			setUserScores(data.user_scores || [])
		})
	}, [])

	useEffect(() => { refreshUserData() }, [refreshUserData])

	async function handleNewEntry() {
		if(newEntryScore < formatter.min || newEntryScore > formatter.max) {
			alert(`Score must be between ${formatter.min} and ${formatter.max}`)
			return
		}

		const data = await apiPut('/user/entry', {entry: newEntryName, score: formatter.toNorm(newEntryScore)})
		setUserScores(data.user_scores || [])
	}

	function handleNewQuiz() {
		if(userScores.length < 3) {
			setQuizMessage('Not enough entries')
			setQuizPair(null)
			return
		}
		setQuizMessage('')
		setQuizPair(pickPair(userScores))
	}

	function handleVoted() {
		handleNewQuiz()
	}

	const sortedScores = useMemo(
		() => [...userScores].sort((a, b) => b.cur - a.cur || b.man - a.man),
		[userScores],
	)

	return (
		<div>
			<div>
				<button onClick={onLogOut}>Log out</button>
				<span>{username}</span>
				<select value={scoreFormatKey} onChange={(e) => setScoreFormatKey(e.target.value)}>
					<option value="Percent">Percent</option>
					<option value="MAL">MAL</option>
				</select>
			</div>

			<hr/>

			<div>
				<input type="text" value={newEntryName} onChange={(e) => setNewEntryName(e.target.value)}/>
				<input type="number" min={formatter.min} max={formatter.max} step={formatter.step}
					value={newEntryScore} onChange={(e) => setNewEntryScore(+e.target.value)}/>
				<button onClick={handleNewEntry}>New Entry</button>
			</div>

			<hr/>

			<div>
				<button onClick={handleNewQuiz}>Random question</button>
				<div>
					{quizMessage}
					{quizPair && <DualQuiz left={quizPair[0]} right={quizPair[1]} onVoted={handleVoted}/>}
				</div>
			</div>

			<hr/>

			<table>
				<thead>
					<tr>
						<th>Entry</th>
						<th>Manual</th>
						<th>Computed</th>
					</tr>
				</thead>
				<tbody>
					{sortedScores.map((entry) => (
						<tr key={entry.id}>
							<td>{entry.label}</td>
							<td>{formatter.pretty(entry.man)}</td>
							<td>{formatter.pretty(entry.cur)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

export default MainPage
