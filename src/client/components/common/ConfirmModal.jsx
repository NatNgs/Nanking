import './Modal.css'

/**
 * Replaces window.confirm(): a blocking yes/no modal. `onCancel` is called
 * both on the Cancel button and on overlay click, mirroring window.confirm's
 * "false" outcome.
 */
function ConfirmModal({message, confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel}) {
	return (
		<div className="modal-overlay" onClick={onCancel}>
			<div className="modal-box" onClick={(e) => e.stopPropagation()}>
				<p className="modal-message">{message}</p>
				<div className="modal-actions">
					<button type="button" onClick={onCancel}>{cancelLabel}</button>
					<button type="button" onClick={onConfirm}>{confirmLabel}</button>
				</div>
			</div>
		</div>
	)
}

export default ConfirmModal
