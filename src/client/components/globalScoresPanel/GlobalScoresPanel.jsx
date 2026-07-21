import { usePaginatedList } from '../../hooks/usePaginatedList.js'
import ScoreTable from '../scoreTable/ScoreTable.jsx'
import PaginationControls from '../pagination/PaginationControls.jsx'

const COLUMNS = [{column: 'Global score', sortKey: 'score', score: (e) => e.score}]

function GlobalScoresPanel({scoreFormatter}) {
	const {items, sort, order, onSort, page, total, limit, goToPage} = usePaginatedList('/entries', {
		initialSort: 'score', initialOrder: 'desc', refreshIntervalMs: 30000,
	})

	return (
		<>
			<ScoreTable items={items} columns={COLUMNS} sort={sort} order={order} onSort={onSort} scoreFormatter={scoreFormatter}/>
			<PaginationControls page={page} total={total} limit={limit} onPageChange={goToPage}/>
		</>
	)
}

export default GlobalScoresPanel
