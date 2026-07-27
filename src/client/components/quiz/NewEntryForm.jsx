import { useCallback, useEffect, useState } from 'react'
import AsyncCreatableSelect from 'react-select/async-creatable'
import { apiGet, apiPut, apiPost } from '../../hooks/useApi.js'
import { useUserContext } from '../../context/UserContext.jsx'
import { useAsyncSearchOptions } from '../../hooks/useAsyncSearchOptions.js'
import { asyncSelectStyles, ASYNC_SELECT_NO_INDICATORS } from '../../lib/reactSelectStyles.js'
import RecentVotesTable from './RecentVotesTable.jsx'
import './NewEntryForm.css'

function NewEntryForm({scoreFormatter}) {
	const {refreshUserData, bumpEntriesVersion} = useUserContext()
	const [newEntryName, setNewEntryName] = useState('')
	const [newEntryScore, setNewEntryScore] = useState(10)
	const [errorMessage, setErrorMessage] = useState('')

	const fetchCandidates = useCallback(
		(q) => q ? apiGet(`/entries?q=${q}`).then((r) => r.items) : Promise.resolve([]),
		[],
	)
	const {
		suggested: suggestedEntries, loadOptions: onSuggestionsFetchRequested, isNewOption: isNewEntry,
	} = useAsyncSearchOptions(fetchCandidates)

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

		let entry = suggestedEntries.find((entry) => entry.label.toLowerCase() === newEntryName)
		if(!entry) {
			// Call to create the new entry
			entry = await apiPut('/entry/new', {name: newEntryName})
		}

		await apiPost('/quiz/direct', {entry: entry.id, score: scoreFormatter.toNorm(newEntryScore)})
		await refreshUserData()
		bumpEntriesVersion()
		setNewEntryName('')
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
					<AsyncCreatableSelect
						loadOptions={onSuggestionsFetchRequested}
						cacheOptions
						name="name"
						isClearable={true}
						onChange={(e) => setNewEntryName(e?.label)}
						createOptionPosition="first"
						formatCreateLabel={(inputValue) => `(New) ${inputValue}`}
						isValidNewOption={isNewEntry}
						noOptionsMessage={() => null}
						placeholder="Search for an entry..."
						components={ASYNC_SELECT_NO_INDICATORS}
						styles={asyncSelectStyles()}
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
