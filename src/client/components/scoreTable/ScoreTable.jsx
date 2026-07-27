import { useMemo } from 'react'
import './ScoreTable.css'
import { scoreToColor } from '../../lib/scoreToColor.js'
import EntrySpan from '../entry/EntrySpan.jsx'

const LABEL_SORT_KEY = 'label'

/**
 * Generic score table: renders one row per item and one column per entry in
 * `columns`, plus a fixed "Entry" (label) column. Column headers are
 * clickable, delegating the actual sort to the parent (server-side sort via
 * usePaginatedList) instead of sorting in memory — `items` is expected to
 * already be sorted/paginated by the caller. Rows whose every column score
 * is null are dropped (a display-only refinement on the current page, it
 * does not affect the server-reported `total`).
 *
 * Each entry of `columns` needs a `sortKey` (server-side sort name, stable
 * across views) distinct from `column` (the displayed label, which can vary
 * per view for the same underlying field).
 */
function ScoreTable({items, columns, scoreFormatter, sort, order, onSort}) {
	const columnScores = useMemo(() => {
		const map = new Map()
		for(const item of items) {
			const scores = {}
			for(const col of columns) scores[col.column] = col.score(item) ?? null
			map.set(item.id, scores)
		}
		return map
	}, [items, columns])

	const visibleItems = useMemo(
		() => items.filter((item) => Object.values(columnScores.get(item.id)).some((v) => v != null)),
		[items, columnScores],
	)

	function sortIndicator(sortKey) {
		if(sort !== sortKey) return null
		return order === 'desc' ? ' ▼' : ' ▲'
	}

	return (
		<div className="score-table-container">
			<table className="score-table">
				<thead>
					<tr>
						<th onClick={() => onSort(LABEL_SORT_KEY)} className="sortable">
							Entry<span className="sortIndicator">{sortIndicator(LABEL_SORT_KEY)}</span>
						</th>
						{columns.map((col) => (
							<th key={col.column} onClick={() => onSort(col.sortKey)} className="sortable">
								{col.column}<span className="sortIndicator">{sortIndicator(col.sortKey)}</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{visibleItems.map((item) => (
						<tr key={item.id}>
							<td className="entryCol"><EntrySpan id={item.id} label={item.label} /></td>
							{columns.map((col) => {
								const value = columnScores.get(item.id)[col.column]
								return (
									<td key={col.column} className="scoreCol">
										{value != null && (
											<>
												<span className="scoreValue">{scoreFormatter.pretty(value)}</span>
												&nbsp;
												<span style={{color: scoreToColor(value)}}>●</span>
											</>
										)}
									</td>
								)
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

export default ScoreTable
