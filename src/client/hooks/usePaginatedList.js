import { useState, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from './useApi.js'

const EMPTY_PAGE = {items: [], page: 1, limit: 100, total: 0, hasMore: false}
const EMPTY_EXTRA_PARAMS = {}

/**
 * Manages page/sort state and fetching for a standard paginated endpoint
 * ({items, page, limit, total, hasMore}). Each view owns its own instance, so
 * its periodic refresh (if any) only ever refetches the page it is currently
 * showing, never the whole dataset.
 *
 * `endpoint`: string (e.g. '/entries') or a function () => string when the
 * URL depends on external state (e.g. '/user/' + username).
 * `extraParams`: fixed extra request params (e.g. tag search filters), or a
 * function returning them, re-evaluated on every fetch. Compared by
 * JSON.stringify (not identity) to decide whether to refetch, so callers
 * don't need to memoize a fresh object/function passed on every render.
 * `refreshIntervalMs`: optional, refetches the SAME current page/sort on a
 * timer while the component stays mounted.
 * `dependsOn`: optional external value (e.g. UserContext's entriesVersion)
 * that, when it changes, forces an immediate refetch of the current page.
 * `method`: 'GET' (default) or 'POST' (for /tags/search, which takes a body).
 */
function usePaginatedList(endpoint, {
	initialSort, initialOrder, limit = 100, extraParams = EMPTY_EXTRA_PARAMS, refreshIntervalMs = null, dependsOn = null, method = 'GET',
} = {}) {
	const [page, setPage] = useState(1)
	const [sort, setSort] = useState(initialSort)
	const [order, setOrder] = useState(initialOrder)
	const [data, setData] = useState(EMPTY_PAGE)
	const [isLoading, setIsLoading] = useState(true)

	// Only functions can't be JSON.stringify'd meaningfully, but a fresh
	// function identity every render is exactly the case this guards
	// against: keep a stable dependency key regardless of extraParams' shape.
	const extraParamsKey = typeof extraParams === 'function' ? null : JSON.stringify(extraParams)

	const fetchPage = useCallback(async () => {
		const url = typeof endpoint === 'function' ? endpoint() : endpoint
		const params = typeof extraParams === 'function' ? extraParams() : extraParams
		const fetcher = method === 'POST' ? apiPost : apiGet
		const result = await fetcher(url, {...params, page, sort, order, limit})
		setData(result)
		setIsLoading(false)
		// Depends on extraParamsKey (content-based), not extraParams' own
		// identity, so a fresh plain-object literal passed by the caller on
		// every render doesn't force a refetch loop. `extraParams` itself is
		// still read fresh from the closure each time this recreates.
	}, [endpoint, extraParamsKey, page, sort, order, limit, method])

	useEffect(() => { fetchPage() }, [fetchPage])

	// Only re-runs when `dependsOn` itself changes (e.g. entriesVersion bump),
	// forcing an immediate refetch of the current page regardless of sort/page.
	useEffect(() => {
		if(dependsOn == null) return
		fetchPage()
	}, [dependsOn])

	useEffect(() => {
		if(!refreshIntervalMs) return
		const id = setInterval(fetchPage, refreshIntervalMs)
		return () => clearInterval(id)
	}, [fetchPage, refreshIntervalMs])

	function onSort(column) {
		if(sort === column) {
			setOrder((prevOrder) => (prevOrder === 'desc' ? 'asc' : 'desc'))
		} else {
			setSort(column)
			setOrder('desc')
		}
		setPage(1) // a sort change always goes back to page 1
	}

	return {
		items: data.items, total: data.total, hasMore: data.hasMore,
		page, limit: data.limit, sort, order, isLoading,
		goToPage: setPage, onSort, refetch: fetchPage,
	}
}

export { usePaginatedList }
