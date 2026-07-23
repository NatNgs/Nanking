import './PaginationControls.css'

/**
 * Sliding-window page picker: first/last page, +-1/+-2/+-10 jumps around the
 * current page, and ellipses for the gaps, each rendered as an <a href="#">
 * with a small label above it (<<, <, Page, >, >>). Renders nothing when
 * there is only one page.
 *
 * The 9 slots (first, -10, -2, -1, current, +1, +2, +10, last) are fixed in
 * position so the layout doesn't jump around as the current page changes.
 * Resolution priority (closest to the current page wins, first/last taking
 * precedence over the +-10 jumps since they are fixed targets rather than
 * relative ones): -1/current/+1, then -2/+2, then first/last, then -10/+10.
 * A slot whose target page falls out of [1, totalPages] or duplicates an
 * already-kept slot is disabled; for -10/+10 specifically, an out-of-range
 * or duplicate target is first recalculated to page-3/page+3 (just past
 * -2/+2) before falling back to disabled, since that keeps the window
 * sliding smoothly instead of leaving a gap - but only once first/last have
 * already claimed their page, so e.g. page 4 of 6 keeps "first" (page 1)
 * rather than letting the recalculated -10 slot steal it. Consecutive
 * surviving slots that aren't adjacent pages get an ellipsis between them.
 */
function PaginationControls({page, total, limit, onPageChange}) {
	const totalPages = Math.max(1, Math.ceil(total / limit))
	if(totalPages <= 1) return null

	// `tier` drives which slots vanish first when the container runs out of
	// space (see PaginationControls.css): 3 = +-10 jumps (crushed first),
	// 2 = +-2 jumps, 1 = first/last (crushed last).
	// Order below is the resolution priority (first declared = wins ties),
	// not the display order: -1/current/+1 first, then -2/+2, then first/last
	// (fixed targets), then the recalculated -10/+10 last, so a fallback jump
	// never steals the page first/last already claimed.
	const slots = [
		{key: 'minus1', page: page - 1, label: '<', tier: 0},
		{key: 'current', page, label: 'Page', isCurrent: true, tier: 0},
		{key: 'plus1', page: page + 1, label: '>', tier: 0},
		{key: 'minus2', page: page - 2, label: '<', tier: 2},
		{key: 'plus2', page: page + 2, label: '>', tier: 2},
		{key: 'first', page: 1, label: '<<', tier: 1},
		{key: 'last', page: totalPages, label: '>>', tier: 1},
		{key: 'minus10', page: page - 10, fallbackPage: page - 3, label: '<', tier: 3},
		{key: 'plus10', page: page + 10, fallbackPage: page + 3, label: '>', tier: 3},
	]

	// The current page always "owns" its page number: pre-seed it so any
	// other slot landing on the same page (e.g. first/last when page is 1 or
	// totalPages) is treated as a duplicate and disabled, instead of the
	// order-of-declaration deciding who wins.
	const seenPages = new Set([page])
	const bySlotKey = {}
	for(const slot of slots) {
		let targetPage = slot.page
		let inRange = targetPage >= 1 && targetPage <= totalPages
		let isDuplicate = inRange && !slot.isCurrent && seenPages.has(targetPage)

		if(slot.fallbackPage != null && (!inRange || isDuplicate)) {
			targetPage = slot.fallbackPage
			inRange = targetPage >= 1 && targetPage <= totalPages
			isDuplicate = inRange && seenPages.has(targetPage)
		}

		const disabled = !inRange || isDuplicate
		if(!disabled) seenPages.add(targetPage)
		bySlotKey[slot.key] = {...slot, page: targetPage, disabled}
	}

	// Re-declare in display order now that resolution has picked each slot's
	// final page; ellipses are computed from this display-ordered sequence.
	const displayOrder = ['first', 'minus10', 'minus2', 'minus1', 'current', 'plus1', 'plus2', 'plus10', 'last']
	let lastKeptPage = null
	const rendered = []
	for(const key of displayOrder) {
		const slot = bySlotKey[key]
		if(!slot.disabled) {
			if(lastKeptPage != null && slot.page - lastKeptPage > 1) {
				rendered.push({ellipsis: true, key: slot.key + '-ellipsis', tier: slot.tier})
			}
			lastKeptPage = slot.page
		}
		rendered.push(slot)
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
