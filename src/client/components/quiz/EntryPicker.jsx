import { useCallback } from 'react'
import { apiGet } from '../../hooks/useApi.js'
import AutocompleteInput from '../common/AutocompleteInput.jsx'

/**
 * Search-and-select picker for manually choosing an existing entry (no
 * "create new" option, unlike NewEntryForm). Calls `onSelect(entryId)` when
 * the user submits a result (tick button or Enter).
 */
function EntryPicker({onSelect}) {
	const fetchSuggestions = useCallback(
		(q) => q ? apiGet(`/entries?q=${q}`).then((r) => r.items) : Promise.resolve([]),
		[],
	)

	return (
		<AutocompleteInput
			fetchSuggestions={fetchSuggestions}
			onSubmit={(option) => onSelect(option.id)}
			placeholder="Search for an entry..."
		/>
	)
}

export default EntryPicker
