import { useState } from 'react'
import { apiPut } from '../../hooks/useApi.js'
import './NewEntryForm.css'

function NewEntryForm({formatter, onEntryCreated}) {
	const [newEntryName, setNewEntryName] = useState('')
	const [newEntryScore, setNewEntryScore] = useState(10)

	async function handleNewEntry() {
		if(newEntryScore < formatter.min || newEntryScore > formatter.max) {
			alert(`Score must be between ${formatter.min} and ${formatter.max}`)
			return
		}

		const data = await apiPut('/user/entry', {entry: newEntryName, score: formatter.toNorm(newEntryScore)})
		onEntryCreated(data.user_scores || [])
		setNewEntryName('')
	}

	return (
		<div className="new-entry-form">
			<input type="text" value={newEntryName} onChange={(e) => setNewEntryName(e.target.value)}/>
			<input type="number" min={formatter.min} max={formatter.max} step={formatter.step}
				value={newEntryScore} onChange={(e) => setNewEntryScore(+e.target.value)}/>
			<button onClick={handleNewEntry}>New Entry</button>
		</div>
	)
}

export default NewEntryForm
