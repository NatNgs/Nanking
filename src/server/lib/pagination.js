const MAX_LIMIT = 100
const DEFAULT_LIMIT = 100

/**
 * Normalizes page/limit coming from an HTTP request (query or body), clamping
 * invalid values silently rather than returning an error.
 */
function normalizePageParams({page, limit} = {}) {
	let p = parseInt(page, 10)
	if(!Number.isInteger(p) || p < 1) p = 1
	let l = parseInt(limit, 10)
	if(!Number.isInteger(l) || l < 1) l = DEFAULT_LIMIT
	if(l > MAX_LIMIT) l = MAX_LIMIT
	return {page: p, limit: l}
}

/**
 * Slices `sortedList` (already filtered and sorted by the caller) into a
 * page. Never sorts itself: sorting stays the caller's responsibility, since
 * the sort order differs per route (e.g. raw score before stretching for
 * getUserListPaginated, name-length relevance for searchEntry). Returns the
 * standard response shape {items, page, limit, total, hasMore}.
 */
function paginate(sortedList, {page, limit} = {}) {
	const {page: p, limit: l} = normalizePageParams({page, limit})
	const total = sortedList.length
	const start = (p - 1) * l
	const items = sortedList.slice(start, start + l)
	return {items, page: p, limit: l, total, hasMore: (p * l) < total}
}

/**
 * Generic comparator by a numeric/string key, for routes sorting on a simple
 * field (score, label). direction = 'asc' | 'desc'. null/undefined values
 * always sort last regardless of direction.
 */
function compareBy(getValue, direction='desc') {
	const sign = direction === 'asc' ? 1 : -1
	return (a, b) => {
		const va = getValue(a)
		const vb = getValue(b)
		if(va == null && vb == null) return 0
		if(va == null) return 1
		if(vb == null) return -1
		if(typeof va === 'string') return sign * va.localeCompare(vb)
		return sign * (va - vb)
	}
}

export { paginate, normalizePageParams, compareBy, MAX_LIMIT, DEFAULT_LIMIT }
