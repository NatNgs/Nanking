import { useState } from 'react'
import { useModalA11y } from '../../hooks/useModalA11y.js'
import './Modal.css'

/**
 * Replaces window.prompt(): a blocking text-input modal. `onSubmit` receives
 * the raw (untrimmed) input value; `onCancel` mirrors window.prompt's "null"
 * outcome (Cancel button, overlay click, or Escape).
 */
function PromptModal({message, initialValue = '', confirmLabel = 'OK', cancelLabel = 'Cancel', error, onSubmit, onCancel}) {
	const [value, setValue] = useState(initialValue)
	const boxRef = useModalA11y(onCancel)

	function handleSubmit(e) {
		e.preventDefault()
		onSubmit(value)
	}

	return (
		<div className="modal-overlay" onClick={onCancel}>
			<div
				className="modal-box" ref={boxRef} role="dialog" aria-modal="true"
				tabIndex={-1} onClick={(e) => e.stopPropagation()}
			>
				<form onSubmit={handleSubmit}>
					<p className="modal-message">{message}</p>
					<input
						type="text"
						className="modal-input"
						value={value}
						onChange={(e) => setValue(e.target.value)}
					/>
					{error && <p className="modal-error">{error}</p>}
					<div className="modal-actions">
						<button type="button" onClick={onCancel}>{cancelLabel}</button>
						<button type="submit">{confirmLabel}</button>
					</div>
				</form>
			</div>
		</div>
	)
}

export default PromptModal
