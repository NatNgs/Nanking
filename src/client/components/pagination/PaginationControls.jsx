import './PaginationControls.css'

/**
 * Sliding-window page picker: first/last page, +-1/+-2/+-10 jumps around the
 * current page, and ellipses for the gaps, each rendered as an <a href="#">
 * with a small label above it (<<, <, Page, >, >>). Renders nothing when
 * there is only one page.
 *
 * The 9 slots (first, -10, -2, -1, current, +1, +2, +10, last) are fixed in
 * position so the layout doesn't jump around as the current page changes;
 * slots whose target page falls out of [1, totalPages] are kept in the DOM
 * but disabled (invisible via opacity, per design) rather than removed.
 * Consecutive surviving (in-range) slots that aren't adjacent pages get an
 * ellipsis between them; slots that land on the same page as a
 * previously-kept one are hidden as duplicates.
 */
function PaginationControls({page, total, limit, onPageChange}) {
	const totalPages = Math.max(1, Math.ceil(total / limit))
	if(totalPages <= 1) return null

	// `tier` drives which slots vanish first when the container runs out of
	// space (see PaginationControls.css): 3 = +-10 jumps (crushed first),
	// 2 = +-2 jumps, 1 = first/last (crushed last).
	const slots = [
		{key: 'first', page: 1, label: '<<', tier: 1},
		{key: 'minus10', page: page - 10, label: '<', tier: 3},
		{key: 'minus2', page: page - 2, label: '<', tier: 2},
		{key: 'minus1', page: page - 1, label: '<', tier: 0},
		{key: 'current', page, label: 'Page', isCurrent: true, tier: 0},
		{key: 'plus1', page: page + 1, label: '>', tier: 0},
		{key: 'plus2', page: page + 2, label: '>', tier: 2},
		{key: 'plus10', page: page + 10, label: '>', tier: 3},
		{key: 'last', page: totalPages, label: '>>', tier: 1},
	]

	// The current page always "owns" its page number: pre-seed it so any
	// other slot landing on the same page (e.g. first/last when page is 1 or
	// totalPages) is treated as a duplicate and disabled, instead of the
	// order-of-declaration deciding who wins.
	const seenPages = new Set([page])
	let lastKeptPage = null
	const rendered = []
	for(const slot of slots) {
		const inRange = slot.page >= 1 && slot.page <= totalPages
		const isDuplicate = inRange && !slot.isCurrent && seenPages.has(slot.page)
		const disabled = !inRange || isDuplicate

		if(inRange && !isDuplicate) {
			if(lastKeptPage != null && slot.page - lastKeptPage > 1) {
				rendered.push({ellipsis: true, key: slot.key + '-ellipsis', tier: slot.tier})
			}
			seenPages.add(slot.page)
			lastKeptPage = slot.page
		}

		rendered.push({...slot, disabled})
	}

	function handleClick(e, slot) {
		e.preventDefault()
		if(slot.disabled || slot.page === page) return
		onPageChange(slot.page)
	}

	return (
		<nav className="pagination-controls" aria-label="Pagination">
			{rendered.map((slot) => {
				if(slot.ellipsis) {
					return <span key={slot.key} className={'pagination-ellipsis pagination-tier-' + slot.tier}>...</span>
				}

				if(slot.isCurrent) {
					return (
						<span key={slot.key} className="pagination-item pagination-current">
							<span className="pagination-item-label">{slot.label}</span>
							<span className="pagination-item-value">{slot.page}</span>
						</span>
					)
				}

				const inRange = slot.page >= 1 && slot.page <= totalPages
				return (
					<a
						key={slot.key}
						href="#"
						className={'pagination-item pagination-tier-' + slot.tier + (slot.disabled ? ' pagination-disabled' : '')}
						aria-disabled={slot.disabled}
						tabIndex={slot.disabled ? -1 : 0}
						onClick={(e) => handleClick(e, slot)}
					>
						<span className="pagination-item-label">{slot.label}</span>
						<span className="pagination-item-value">{inRange ? slot.page : ' '}</span>
					</a>
				)
			})}
		</nav>
	)
}

export default PaginationControls
