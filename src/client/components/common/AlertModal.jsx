import { useModalA11y } from '../../hooks/useModalA11y.js'
import './Modal.css'

/**
 * Replaces window.alert(): a blocking informational modal with a single
 * acknowledgement button. `onClose` is called both on that button and on
 * overlay click.
 */
function AlertModal({message, onClose}) {
	const boxRef = useModalA11y(onClose)

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div
				className="modal-box" ref={boxRef} role="dialog" aria-modal="true"
				tabIndex={-1} onClick={(e) => e.stopPropagation()}
			>
				<p className="modal-message">{message}</p>
				<div className="modal-actions">
					<button type="button" onClick={onClose}>OK</button>
				</div>
			</div>
		</div>
	)
}

export default AlertModal
