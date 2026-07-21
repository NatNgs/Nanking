import { useState } from 'react'

/**
 * Backs a "Rename" button that prompts for a new value via window.prompt,
 * skips the call entirely if left empty/unchanged, and reports a 409
 * conflict distinctly from any other failure. `patch(trimmedValue)` performs
 * the actual request and is expected to update the caller's own state (e.g.
 * via setEntry/setTag) on success.
 */
function useRenamePrompt({currentValue, promptMessage, patch, conflictMessage, failMessage}) {
	const [isRenaming, setIsRenaming] = useState(false)

	async function rename() {
		const newValue = window.prompt(promptMessage + ' "' + currentValue + '"', currentValue)
		if(newValue == null) return
		const trimmed = newValue.trim()
		if(!trimmed || trimmed === currentValue) return

		setIsRenaming(true)
		try {
			await patch(trimmed)
		} catch(err) {
			alert(err.response?.status === 409 ? conflictMessage : failMessage)
		} finally {
			setIsRenaming(false)
		}
	}

	return {isRenaming, rename}
}

export { useRenamePrompt }
