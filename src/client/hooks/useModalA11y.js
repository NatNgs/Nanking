import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
	'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
	'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Shared accessibility behavior for every blocking modal (AlertModal,
 * ConfirmModal, PromptModal, LoginModal, DeleteAccountModal):
 * - moves focus into the modal on mount (first focusable element, or the
 *   container itself if none)
 * - restores focus to whatever was focused before the modal opened, on unmount
 * - traps Tab/Shift+Tab focus cycling within the modal
 * - calls `onCancel` on Escape, unless `onCancel` is not provided
 *
 * Returns a ref to attach to the modal's outermost box element.
 */
function useModalA11y(onCancel) {
	const boxRef = useRef(null)

	useEffect(() => {
		const previouslyFocused = document.activeElement
		const box = boxRef.current
		const focusables = () => box ? [...box.querySelectorAll(FOCUSABLE_SELECTOR)] : []

		const initial = focusables()[0] || box
		initial?.focus()

		function onKeyDown(e) {
			if(e.key === 'Escape' && onCancel) {
				e.stopPropagation()
				onCancel()
				return
			}
			if(e.key !== 'Tab') return

			const items = focusables()
			if(!items.length) return
			const first = items[0]
			const last = items[items.length - 1]
			if(e.shiftKey && document.activeElement === first) {
				e.preventDefault()
				last.focus()
			} else if(!e.shiftKey && document.activeElement === last) {
				e.preventDefault()
				first.focus()
			}
		}

		box?.addEventListener('keydown', onKeyDown)
		return () => {
			box?.removeEventListener('keydown', onKeyDown)
			previouslyFocused?.focus?.()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return boxRef
}

export { useModalA11y }
