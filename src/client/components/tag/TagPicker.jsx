import { useCallback } from 'react'
import { apiPost, apiPut } from '../../hooks/useApi.js'
import AutocompleteInput from '../common/AutocompleteInput.jsx'

/**
 * Generic tag picker: proposes tags matching `searchFilter` (forwarded as-is
 * to POST /api/tags/search, e.g. {notOnEntity} or {notHavingAsChild}), plus
 * the option to create a brand new tag on the fly. Submitting (tick button
 * or Enter) creates the tag if needed and calls `onAdd(tagId)`.
 */
function TagPicker({searchFilter, onAdd, disabled, placeholder, submitLabel, className}) {
	// Depends on searchFilter's content (JSON.stringify), not its own identity,
	// so a fresh plain-object literal passed by the caller on every render
	// doesn't force AutocompleteInput to reset its cache on every render.
	// `searchFilter` itself is still read fresh from the closure each time
	// this recreates.
	const fetchSuggestions = useCallback(
		(q) => apiPost('/tags/search', {q, ...searchFilter}).then((r) => r.items),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[JSON.stringify(searchFilter)],
	)

	async function handleSubmit(option) {
		let tagId = option.id
		if(tagId == null) {
			const created = await apiPut('/tag/new', {label: option.label})
			tagId = created.id
		}
		await onAdd(tagId)
	}

	return (
		<div className={className}>
			<AutocompleteInput
				fetchSuggestions={fetchSuggestions}
				onSubmit={handleSubmit}
				allowNew
				disabled={disabled}
				placeholder={placeholder}
				submitLabel={submitLabel}
			/>
		</div>
	)
}

export default TagPicker
