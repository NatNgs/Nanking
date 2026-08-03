import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPut, apiPost } from '../../hooks/useApi.js'
import { useUserContext } from '../../context/UserContext.jsx'
import AutocompleteInput from '../common/AutocompleteInput.jsx'
import RecentVotesTable from './RecentVotesTable.jsx'
import './NewEntryForm.css'

function NewEntryForm({scoreFormatter}) {
	const {refreshUserData, bumpEntriesVersion} = useUserContext()
	const [newEntryName, setNewEntryName] = useState('')
	const [newEntryScore, setNewEntryScore] = useState(10)
	const [errorMessage, setErrorMessage] = useState('')
	const nameInputRef = useRef(null)

	const fetchSuggestions = useCallback(
		(q) => q ? apiGet(`/entries?q=${q}`).then((r) => r.items) : Promise.resolve([]),
		[],
	)

	async function handleNewEntry() {
		const name = newEntryName.trim()
		if(!name) {
			setErrorMessage('Entry name is empty')
			return
		}
		if(newEntryScore < scoreFormatter.min || newEntryScore > scoreFormatter.max) {
			setErrorMessage(`Score must be between ${scoreFormatter.min} and ${scoreFormatter.max}`)
			return
		}

		const matches = await fetchSuggestions(name)
		let entry = matches.find((candidate) => candidate.label.toLowerCase() === name.toLowerCase())
		if(!entry) {
			// Call to create the new entry
			entry = await apiPut('/entry/new', {name})
		}

		await apiPost('/quiz/direct', {entry: entry.id, score: scoreFormatter.toNorm(newEntryScore)})
		await refreshUserData()
		bumpEntriesVersion()
		setNewEntryName('')
		nameInputRef.current?.reset()
	}


	// When scoreFormatter changes, set newEntryScore to max score
	useEffect(() => {
		setNewEntryScore(scoreFormatter.max)
	}, [scoreFormatter])

	return (
		<div className="new-entry-form">
			<h2 className="title">New Entry</h2>
			<div className="content">
				<div className="labelled">
					<label for="name">Entry name:</label>
					<AutocompleteInput
						ref={nameInputRef}
						fetchSuggestions={fetchSuggestions}
						onValueChange={setNewEntryName}
						allowNew
						placeholder="Search for an entry..."
					/>
				</div>
				<div className="labelled">
					<label for="score">Initial score:</label>
					<input
						name="score" type="number" min={scoreFormatter.min} max={scoreFormatter.max}
						step={scoreFormatter.step} value={newEntryScore}
						onChange={(e) => setNewEntryScore(+e.target.value)}
					/>
				</div>
				<div className="labelled">
					<span>&nbsp;</span>
					<button onClick={handleNewEntry}>Confirm</button>
				</div>
			</div>
			<div className="error-message">{errorMessage}</div>
			<RecentVotesTable scoreFormatter={scoreFormatter} type="direct" limit={5} showPagination />
		</div>
	)
}

export default NewEntryForm
