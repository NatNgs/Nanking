import { useCallback, useState } from 'react'
import AsyncCreatableSelect from 'react-select/async-creatable'
import { apiPost, apiPut } from '../../hooks/useApi.js'
import { useAsyncSearchOptions } from '../../hooks/useAsyncSearchOptions.js'
import { asyncSelectStyles, ASYNC_SELECT_NO_INDICATORS } from '../../lib/reactSelectStyles.js'

/**
 * Generic tag picker: proposes tags matching `searchFilter` (forwarded as-is
 * to POST /api/tags/search, e.g. {notOnEntity} or {notHavingAsChild}), plus
 * the option to create a brand new tag on the fly. On confirmation, creates
 * the tag if needed and calls `onAdd(tagId)`.
 */
function TagPicker({searchFilter, onAdd, disabled, placeholder, className}) {
	const [selected, setSelected] = useState(null)

	// Depends on searchFilter's content (JSON.stringify), not its own identity,
	// so a fresh plain-object literal passed by the caller on every render
	// doesn't force loadOptions to recreate (and react-select to re-fetch) on
	// every keystroke. `searchFilter` itself is still read fresh from the
	// closure each time this recreates.
	const fetchCandidates = useCallback(
		(q) => apiPost('/tags/search', {q, ...searchFilter}).then((r) => r.items),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[JSON.stringify(searchFilter)],
	)
	const {suggested, loadOptions, isNewOption} = useAsyncSearchOptions(fetchCandidates)

	async function handleAdd() {
		if(!selected) return

		let tagId = selected.value
		if(!suggested.find((t) => t.id === selected.value)) {
			const created = await apiPut('/tag/new', {label: selected.label})
			tagId = created.id
		}

		await onAdd(tagId)
		setSelected(null)
	}

	return (
		<div className={className}>
			<AsyncCreatableSelect
				loadOptions={loadOptions}
				cacheOptions
				isClearable={true}
				value={selected}
				onChange={(e) => setSelected(e)}
				createOptionPosition="first"
				formatCreateLabel={(inputValue) => `(New) ${inputValue}`}
				isValidNewOption={isNewOption}
				noOptionsMessage={() => null}
				placeholder={placeholder}
				components={ASYNC_SELECT_NO_INDICATORS}
				styles={asyncSelectStyles({minWidth: '12em'})}
			/>
			<button disabled={disabled || !selected} onClick={handleAdd}>+</button>
		</div>
	)
}

export default TagPicker
