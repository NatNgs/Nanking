import { useEffect, useState } from 'react'
import debounce from 'lodash.debounce';
import AsyncCreatableSelect from 'react-select/async-creatable';
import { apiGet, apiPut, apiPost } from '../../hooks/useApi.js'
import './NewEntryForm.css'

const debounceDellay = 1000;
function NewEntryForm({scoreFormatter}) {
	const [newEntryName, setNewEntryName] = useState('')
	const [newEntryScore, setNewEntryScore] = useState(10)
	const [errorMessage, setErrorMessage] = useState('')
	const [suggestedEntries, setSuggestedEntries] = useState([])

	async function _onSuggestionsFetchRequested(value, cb) {
		const newEntryName = value.toLowerCase().trim().replace(/\s+/g, ' ')
		if(!newEntryName)
			return cb([])

		const entries = await apiGet(`/entries?q=${newEntryName}`)
		setSuggestedEntries(entries)
		cb(entries.map(e=>({label: e.label, value: e.id})))
	}
	const onSuggestionsFetchRequested = debounce(_onSuggestionsFetchRequested, debounceDellay)

	function isNewEntry(newEntryName) {
		if(!newEntryName) return false
		newEntryName = newEntryName.toLowerCase().trim().replace(/\s+/g, ' ')
		return newEntryName && !suggestedEntries.find((entry) => entry.label.toLowerCase() === newEntryName)
	}

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

		const data = await apiPost('/quiz/default', {entry: entry.id, score: scoreFormatter.toNorm(newEntryScore)})
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
						components={{ DropdownIndicator:() => null, IndicatorSeparator:() => null }}
						styles={{
							menu: (base) => ({...base, marginTop: 0}),
							option: (base) => ({...base, cursor: 'pointer'}),
							control: (base) => ({...base, cursor: 'text', borderColor: 'gray'}),
							indicatorsContainer: (base) => ({...base, cursor: 'pointer'}),
						}}
					/>
				</div>
				<div className="labelled">
					<label for="score">Initial score:</label>
					<input name="score" type="number" min={scoreFormatter.min} max={scoreFormatter.max} step={scoreFormatter.step} value={newEntryScore} onChange={(e) => setNewEntryScore(+e.target.value)}/>
				</div>
				<div className="labelled">
					<span>&nbsp;</span>
					<button onClick={handleNewEntry}>Confirm</button>
				</div>
			</div>
			<div className="error-message">{errorMessage}</div>
		</div>
	)
}

export default NewEntryForm
