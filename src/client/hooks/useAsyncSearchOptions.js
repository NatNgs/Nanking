import { useMemo, useState } from 'react'
import debounce from 'lodash.debounce'
import { ASYNC_SELECT_DEBOUNCE_DELAY } from '../lib/reactSelectStyles.js'

/**
 * Backs an AsyncCreatableSelect: debounces `fetchCandidates(query)` (which
 * must resolve to a `[{id, label}, ...]` list), keeps the last results to
 * validate "is this a genuinely new label" against, and exposes `loadOptions`
 * in the shape react-select expects (`(value, cb) => void`).
 *
 * `fetchCandidates` should be stable across renders (e.g. wrapped in
 * useCallback by the caller) so the debounce isn't recreated every render.
 */
function useAsyncSearchOptions(fetchCandidates) {
	const [suggested, setSuggested] = useState([])

	const loadOptions = useMemo(() => debounce(async (value, cb) => {
		const q = value.toLowerCase().trim().replace(/\s+/g, ' ')
		const candidates = await fetchCandidates(q)
		setSuggested(candidates)
		cb(candidates.map((c) => ({label: c.label, value: c.id})))
	}, ASYNC_SELECT_DEBOUNCE_DELAY), [fetchCandidates])

	function isNewOption(label) {
		if(!label) return false
		const lower = label.toLowerCase().trim().replace(/\s+/g, ' ')
		return lower && !suggested.find((c) => c.label.toLowerCase() === lower)
	}

	return {suggested, loadOptions, isNewOption}
}

export { useAsyncSearchOptions }
