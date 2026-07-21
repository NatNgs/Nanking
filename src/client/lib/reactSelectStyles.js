const ASYNC_SELECT_DEBOUNCE_DELAY = 1000

/**
 * Shared react-select styling for every AsyncCreatableSelect in the app
 * (entry/tag pickers, NewEntryForm): flush menu, pointer cursors, a text
 * cursor on the control. `controlExtra` merges extra control-specific rules
 * (e.g. a fixed minWidth).
 */
function asyncSelectStyles(controlExtra = {}) {
	return {
		menu: (base) => ({...base, marginTop: 0}),
		option: (base) => ({...base, cursor: 'pointer'}),
		control: (base) => ({...base, cursor: 'text', borderColor: 'gray', ...controlExtra}),
		indicatorsContainer: (base) => ({...base, cursor: 'pointer'}),
	}
}

const ASYNC_SELECT_NO_INDICATORS = {DropdownIndicator: () => null, IndicatorSeparator: () => null}

export { ASYNC_SELECT_DEBOUNCE_DELAY, asyncSelectStyles, ASYNC_SELECT_NO_INDICATORS }
