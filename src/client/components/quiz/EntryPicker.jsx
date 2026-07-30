import { useCallback } from 'react'
import AsyncSelect from 'react-select/async'
import { apiGet } from '../../hooks/useApi.js'
import { useAsyncSearchOptions } from '../../hooks/useAsyncSearchOptions.js'
import { asyncSelectStyles, ASYNC_SELECT_NO_INDICATORS } from '../../lib/reactSelectStyles.js'

/**
 * Search-and-select picker for manually choosing an existing entry (no
 * "create new" option, unlike NewEntryForm's AsyncCreatableSelect). Calls
 * `onSelect(entryId)` when the user picks a result, then clears itself.
 */
function EntryPicker({onSelect}) {
	const fetchCandidates = useCallback(
		(q) => q ? apiGet(`/entries?q=${q}`).then((r) => r.items) : Promise.resolve([]),
		[],
	)
	const {loadOptions: onSuggestionsFetchRequested} = useAsyncSearchOptions(fetchCandidates)

	return (
		<AsyncSelect
			loadOptions={onSuggestionsFetchRequested}
			cacheOptions
			value={null}
			isClearable={true}
			onChange={(option) => option && onSelect(option.value)}
			noOptionsMessage={() => null}
			placeholder="Search for an entry..."
			components={ASYNC_SELECT_NO_INDICATORS}
			styles={asyncSelectStyles()}
		/>
	)
}

export default EntryPicker
