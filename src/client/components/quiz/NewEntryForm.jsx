import { useEffect, useState } from 'react'
import { apiPut } from '../../hooks/useApi.js'
import './NewEntryForm.css'

function NewEntryForm({scoreFormatter, onEntryCreated}) {
	const [newEntryName, setNewEntryName] = useState('')
	const [newEntryScore, setNewEntryScore] = useState(10)
	const [errorMessage, setErrorMessage] = useState('')

	async function handleNewEntry() {
		if(!newEntryName) {
			setErrorMessage('Entry name is empty')
			// Make input focus
			return
		}
		if(newEntryScore < scoreFormatter.min || newEntryScore > scoreFormatter.max) {
			setErrorMessage(`Score must be between ${scoreFormatter.min} and ${scoreFormatter.max}`)
			return
		}

		const data = await apiPut('/user/entry', {entry: newEntryName, score: scoreFormatter.toNorm(newEntryScore)})
		onEntryCreated(data.user_scores || [])
		setNewEntryName('')
	}

	// When scoreFormatter changes, set newEntryScore to max score
	useEffect(() => {
		setNewEntryScore(scoreFormatter.max)
	}, [scoreFormatter])

	return (
		<div className="new-entry-form">
			<h2 class="title">New Entry</h2>
			<div class="content">
				<div className="labelled">
					<label for="name">Entry name:</label>
					<input name="name" type="text" value={newEntryName} onChange={(e) => setNewEntryName(e.target.value)} placeholder="Enter the new entry name" pattern="\S+"/>
				</div>
				<div className="labelled">
					<label for="score">Initial score:</label>
					<input name="score" type="number" min={scoreFormatter.min} max={scoreFormatter.max} step={scoreFormatter.step} value={newEntryScore} onChange={(e) => setNewEntryScore(+e.target.value)}/>
				</div>
				<div className="labelled">
					<span>&nbsp;</span>
					<button onClick={handleNewEntry}>Add this entry</button>
				</div>
			</div>
			<div className="error-message">{errorMessage}</div>
		</div>
	)
}

export default NewEntryForm
