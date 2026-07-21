import { useEffect, useState } from 'react'
import './EntriesPanel.css'
import { useUserContext } from '../../context/UserContext.jsx'
import { usePaginatedList } from '../../hooks/usePaginatedList.js'
import ScoreTable from '../scoreTable/ScoreTable.jsx'
import PaginationControls from '../pagination/PaginationControls.jsx'

const COLUMNS = [
	{column: 'Score', sortKey: 'score', score: (e) => e.score},
	{column: 'Global', sortKey: 'globalScore', score: (e) => e.globalScore},
]

function EntriesPanel({scoreFormatter, isOpen, onToggle}) {
	// Only show panel when screen is wide enough (desktop mode)
	const {entriesVersion} = useUserContext()
	const [isToBeDisplayed, setToBeDisplayed] = useState(window.innerWidth > 1000)
	const updateMedia = () => setToBeDisplayed(window.innerWidth > 1000)
	useEffect(() => window.addEventListener('resize', updateMedia), [updateMedia])

	const {items, sort, order, onSort, page, total, limit, goToPage} = usePaginatedList('/user/me/entities', {
		initialSort: 'score', initialOrder: 'desc', refreshIntervalMs: 30000, dependsOn: entriesVersion,
	})

	return (
		<>
		{isToBeDisplayed && (
			<button
				type="button"
				className={'entries-panel-toggle' + (isOpen ? '' : ' entries-panel-toggle-closed')}
				onClick={onToggle}
			>
				{isOpen ? '>' : '<'}
			</button>
		)}
		{isToBeDisplayed && isOpen && (
			<aside className="entries-panel">
				<ScoreTable items={items} columns={COLUMNS} sort={sort} order={order} onSort={onSort} scoreFormatter={scoreFormatter}/>
				<PaginationControls page={page} total={total} limit={limit} onPageChange={goToPage}/>
			</aside>
		)}
		</>
	)
}

export default EntriesPanel
