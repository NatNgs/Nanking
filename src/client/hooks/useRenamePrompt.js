import { useState } from 'react'

/**
 * Backs a "Rename" button with a PromptModal instead of window.prompt, skips
 * the call entirely if left empty/unchanged, and reports a 409 conflict
 * distinctly from any other failure via an AlertModal.
 * `patch(trimmedValue)` performs the actual request and is expected to
 * update the caller's own state (e.g. via setEntry/setTag) on success.
 *
 * Returns the render state for both modals: spread `promptModalProps` onto a
 * PromptModal and `alertModalProps` onto an AlertModal, each only when its
 * respective `show*` flag is true.
 */
function useRenamePrompt({currentValue, promptMessage, patch, conflictMessage, failMessage}) {
	const [isRenaming, setIsRenaming] = useState(false)
	const [showPrompt, setShowPrompt] = useState(false)
	const [alertMessage, setAlertMessage] = useState(null)

	function rename() {
		setShowPrompt(true)
	}

	async function submitRename(newValue) {
		const trimmed = newValue.trim()
		setShowPrompt(false)
		if(!trimmed || trimmed === currentValue) return

		setIsRenaming(true)
		try {
			await patch(trimmed)
		} catch(err) {
			setAlertMessage(err.response?.status === 409 ? conflictMessage : failMessage)
		} finally {
			setIsRenaming(false)
		}
	}

	return {
		isRenaming,
		rename,
		promptModalProps: {
			show: showPrompt,
			message: promptMessage + ' "' + currentValue + '"',
			initialValue: currentValue,
			onSubmit: submitRename,
			onCancel: () => setShowPrompt(false),
		},
		alertModalProps: {
			show: alertMessage != null,
			message: alertMessage,
			onClose: () => setAlertMessage(null),
		},
	}
}

export { useRenamePrompt }
