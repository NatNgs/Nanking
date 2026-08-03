import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useCombobox } from 'downshift'
import debounce from 'lodash.debounce'
import './AutocompleteInput.css'

const DEBOUNCE_DELAY = 1000

const normalize = (text) => text.toLowerCase().trim().replace(/\s+/g, ' ')

/**
 * Search-and-select combobox backing every "search among entries/tags"
 * picker in the app (EntryPicker, TagPicker, NewEntryForm). Replaces the
 * previous react-select-based implementation: react-select's own request
 * cache (`cacheOptions`) desynchronized from consumers' own bookkeeping,
 * producing the "suggestions disappear" and "can't reselect without
 * clearing" bugs. This component owns its cache and debounce internally
 * instead, keyed on the trimmed/lowercased query.
 *
 * `fetchSuggestions(query)` must resolve to a `[{id, label}, ...]` list.
 * It should be stable across renders (e.g. wrapped in useCallback by the
 * caller), since a change resets the cache (see effect below).
 *
 * The cache lives only for the component's lifetime (a fresh Map on mount,
 * cleared whenever `fetchSuggestions` identity changes) - no cross-mount or
 * cross-component persistence, as requested.
 *
 * `allowNew`, when set, turns on "(New) <label>" support:
 * - if the current input text doesn't match any suggestion's label
 *   (case-insensitive, trimmed), a "(New)" indicator is shown inside the
 *   input itself, to the right of the typed text (or a spinner while a
 *   search is in flight, reserving the same width either way so the field
 *   doesn't reflow), and a matching pseudo-item `{id: null, label, isNew:
 *   true}` is prepended to the dropdown (always first) - rendered with a
 *   grayed-out "(New)" prefix ahead of the label - so it can also be picked
 *   from there. Hidden while a search is in flight (a non-blocking "Loading..."
 *   row is shown instead, alongside whatever's still cached from a previous
 *   query), since until the response comes back we don't actually know the
 *   typed text is new;
 * - the submit button/Enter key accept that not-yet-existing value too.
 * When `allowNew` is false, submitting is only possible once the typed text
 * exactly matches one of the fetched suggestions.
 *
 * The pseudo-item has to be part of the same array passed as `items` to
 * useCombobox (not spliced in only for rendering), otherwise downshift's own
 * index bookkeeping for click/keyboard selection desyncs from what's drawn
 * on screen and clicking "(New) ..." silently does nothing.
 *
 * Picking a suggestion from the dropdown (click or keyboard) only fills the
 * input with its label - it does not submit anything by itself. Submitting
 * (creating/adding/selecting the entry for real) only happens through
 * `onSubmit`.
 *
 * `onSubmit(value)`, when provided, enables a submit button (label set via
 * `submitLabel`, defaulting to a tick "✓") glued to the right of the input
 * (same height, no gap, reads as the input's own extension): pressing Enter
 * or clicking it calls `onSubmit` with `{id, label}` - `id` is the matched
 * suggestion's id, or null if the value is new (only possible when
 * `allowNew` is set). The button is hidden entirely when `onSubmit` is
 * null/undefined, and disabled while nothing submittable is typed (empty
 * input, or non-matching text with `allowNew` false).
 * `onValueChange(text)` is called on every keystroke so a parent can mirror
 * the raw typed text if it needs to.
 *
 * A parent that doesn't use `onSubmit` (e.g. NewEntryForm, which validates
 * and submits through its own separate "Confirm" button) is responsible for
 * clearing the input itself after a successful submission - the component
 * is uncontrolled internally, so setting the mirrored `onValueChange` state
 * back to '' has no effect on it. Pass a `ref` and call `.reset()` on it.
 */
const AutocompleteInput = forwardRef(function AutocompleteInput({
	fetchSuggestions,
	onSubmit,
	onValueChange,
	placeholder = 'Search...',
	submitLabel = '✓',
	disabled,
	allowNew = false,
	className,
}, ref) {
	const [suggestions, setSuggestions] = useState([])
	const [typedValue, setTypedValue] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const cacheRef = useRef(new Map())
	const latestQueryRef = useRef('')

	// A new fetchSuggestions means the results it would produce are no longer
	// comparable to whatever is cached (e.g. TagPicker's searchFilter changed).
	useEffect(() => {
		cacheRef.current = new Map()
	}, [fetchSuggestions])

	const runSearch = useMemo(() => debounce(async (query) => {
		setIsLoading(true)
		try {
			const results = await fetchSuggestions(query)
			cacheRef.current.set(query, results)
			// Stale-response guard: the user may have kept typing during the request.
			if(latestQueryRef.current === query) setSuggestions(results)
		} finally {
			if(latestQueryRef.current === query) setIsLoading(false)
		}
	}, DEBOUNCE_DELAY), [fetchSuggestions])

	useEffect(() => () => runSearch.cancel(), [runSearch])

	const query = normalize(typedValue)
	const hasExactMatch = suggestions.some((item) => normalize(item.label) === query)
	// Hidden while a search is in flight: the current suggestions list may be
	// stale for the just-typed query, so we don't yet know it's really new.
	const showNew = allowNew && query && !hasExactMatch && !isLoading
	const items = showNew
		? [{id: null, label: typedValue.trim(), isNew: true}, ...suggestions]
		: suggestions

	const {
		isOpen, getMenuProps, getInputProps, getItemProps, highlightedIndex, reset: resetCombobox,
	} = useCombobox({
		items,
		itemToString: (item) => item?.label ?? '',
		onInputValueChange({inputValue: value, type}) {
			// Only real typing should trigger a search; selection/blur changes
			// inputValue too but must not re-open a stale query.
			if(type !== useCombobox.stateChangeTypes.InputChange) return

			setTypedValue(value)
			onValueChange?.(value)
			const nextQuery = normalize(value)
			latestQueryRef.current = nextQuery

			if(!nextQuery) {
				runSearch.cancel()
				setSuggestions([])
				setIsLoading(false)
				return
			}

			const cached = cacheRef.current.get(nextQuery)
			if(cached) {
				runSearch.cancel()
				setSuggestions(cached)
				setIsLoading(false)
				return
			}

			setIsLoading(true)
			runSearch(nextQuery)
		},
		onSelectedItemChange({selectedItem}) {
			if(!selectedItem) return
			// Picking a suggestion only fills the input - see file-level comment.
			setTypedValue(selectedItem.label)
			onValueChange?.(selectedItem.label)
		},
	})

	const canSubmit = query && (allowNew || hasExactMatch)

	function clear() {
		resetCombobox()
		setTypedValue('')
		setSuggestions([])
	}

	function submit() {
		if(!canSubmit || !onSubmit) return
		const matched = suggestions.find((item) => normalize(item.label) === query)
		onSubmit(matched ? {id: matched.id, label: matched.label} : {id: null, label: typedValue.trim()})
		clear()
	}

	useImperativeHandle(ref, () => ({reset: clear}))

	const {onKeyDown: comboboxOnKeyDown, ...inputProps} = getInputProps({disabled, placeholder})

	return (
		<div className={`autocomplete-input ${className || ''}`}>
			<div className="autocomplete-input-row">
				<div className="autocomplete-input-field">
					<input
						{...inputProps}
						onKeyDown={(e) => {
							comboboxOnKeyDown?.(e)
							if(e.key === 'Enter' && !isOpen) submit()
						}}
					/>
					<span className="autocomplete-input-prefix">
						{isLoading
							? <img className="autocomplete-input-spinner" src="/assets/loading.svg" alt="" />
							: showNew && <span className="autocomplete-input-new">(New)</span>}
					</span>
				</div>
				{onSubmit && (
					<button
						type="button"
						className="autocomplete-input-submit"
						disabled={disabled || !canSubmit}
						onClick={submit}
					>{submitLabel}</button>
				)}
			</div>
			<ul {...getMenuProps()} className={isOpen && (items.length || isLoading) ? 'open' : ''}>
				{isOpen && isLoading && <li className="status">Loading...</li>}
				{isOpen && items.map((item, index) => (
					<li
						key={item.isNew ? '__new__' : item.id}
						className={highlightedIndex === index ? 'highlighted' : ''}
						{...getItemProps({item, index})}
					>
						{item.isNew
							? <><span className="autocomplete-input-new">(New)</span> {item.label}</>
							: item.label}
					</li>
				))}
			</ul>
		</div>
	)
})

export default AutocompleteInput
