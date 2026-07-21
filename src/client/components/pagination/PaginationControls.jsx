import './PaginationControls.css'

/**
 * Previous/Next + "Page X / Y" controls for a usePaginatedList-backed view.
 * Pure display component: `onPageChange` is expected to call the hook's
 * `goToPage`. Renders nothing when there is only one page.
 */
function PaginationControls({page, total, limit, onPageChange}) {
	const totalPages = Math.max(1, Math.ceil(total / limit))
	if(totalPages <= 1) return null

	return (
		<div className="pagination-controls">
			<button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>&lt; Previous</button>
			<span>Page {page} / {totalPages}</span>
			<button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next &gt;</button>
		</div>
	)
}

export default PaginationControls
