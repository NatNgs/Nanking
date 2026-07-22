import './Modal.css'

/**
 * Replaces window.alert(): a blocking informational modal with a single
 * acknowledgement button. `onClose` is called both on that button and on
 * overlay click.
 */
function AlertModal({message, onClose}) {
	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-box" onClick={(e) => e.stopPropagation()}>
				<p className="modal-message">{message}</p>
				<div className="modal-actions">
					<button type="button" onClick={onClose}>OK</button>
				</div>
			</div>
		</div>
	)
}

export default AlertModal
