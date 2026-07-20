import { useMemo, useState } from 'react'
import './ScoreTable.css'
import { scoreToColor } from '../../lib/scoreToColor.js'

/**
 * Builds the initial sort rules from `columns[].sortOrder`, ordered by
 * ascending `abs(sortOrder)`. Positive sortOrder sorts descending, negative
 * sorts ascending.
 */
function initialSortRules(columns) {
	return columns
		.filter((c) => c.sortOrder != null)
		.sort((a, b) => Math.abs(a.sortOrder) - Math.abs(b.sortOrder))
		.map((c) => ({column: c.column, order: c.sortOrder < 0 ? 'asc' : 'desc'}))
}

/**
 * Reorders `sortRules` after a click on `column`: flips its order if it is
 * already the leading rule, otherwise moves it to the front (dropping any
 * previous rule on the same column) ahead of the existing rules.
 */
function applySortClick(sortRules, column) {
	if(sortRules[0]?.column === column) {
		const [head, ...rest] = sortRules
		return [{column, order: head.order === 'desc' ? 'asc' : 'desc'}, ...rest]
	}
	const rest = sortRules.filter((r) => r.column !== column)
	return [{column, order: 'desc'}, ...rest]
}

function compareEntries(a, b, sortRules, columnScores) {
	for(const rule of sortRules) {
		const va = rule.column === 'Entry' ? a.label : columnScores.get(a.id)?.[rule.column]
		const vb = rule.column === 'Entry' ? b.label : columnScores.get(b.id)?.[rule.column]

		// Null/undefined scores always sort last, regardless of order
		if(va == null && vb == null) continue
		if(va == null) return 1
		if(vb == null) return -1

		let cmp
		if(rule.column === 'Entry') cmp = String(va).localeCompare(String(vb))
		else cmp = va - vb

		if(cmp !== 0) return rule.order === 'desc' ? -cmp : cmp
	}
	return 0
}

/**
 * Generic score table: renders one row per entry and one column per entry in
 * `columns`, plus a fixed "Entry" (label) column. Column headers are
 * clickable to sort. Rows whose every column score is null are dropped.
 */
function ScoreTable({entries, columns, scoreFormatter}) {
	const [sortRules, setSortRules] = useState(() => initialSortRules(columns))

	const columnScores = useMemo(() => {
		const map = new Map()
		for(const entry of entries) {
			const scores = {}
			for(const col of columns) scores[col.column] = col.score(entry) ?? null
			map.set(entry.id, scores)
		}
		return map
	}, [entries, columns])

	const visibleEntries = useMemo(
		() => entries.filter((entry) => Object.values(columnScores.get(entry.id)).some((v) => v != null)),
		[entries, columnScores],
	)

	const sortedEntries = useMemo(
		() => [...visibleEntries].sort((a, b) => compareEntries(a, b, sortRules, columnScores)),
		[visibleEntries, sortRules, columnScores],
	)

	function sortIndicator(column) {
		if(sortRules[0]?.column !== column) return null
		return sortRules[0].order === 'desc' ? ' ▼' : ' ▲'
	}

	function onHeaderClick(column) {
		setSortRules((rules) => applySortClick(rules, column))
	}

	return (
		<div className="score-table-container">
			<table className="score-table">
				<thead>
					<tr>
						<th onClick={() => onHeaderClick('Entry')}>Entry{sortIndicator('Entry')}</th>
						{columns.map((col) => (
							<th key={col.column} onClick={() => onHeaderClick(col.column)}>{col.column}{sortIndicator(col.column)}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{sortedEntries.map((entry) => (
						<tr key={entry.id}>
							<td>{entry.label}</td>
							{columns.map((col) => {
								const value = columnScores.get(entry.id)[col.column]
								return (
									<td key={col.column} className="scoreCol">
										{value != null && (
											<>{scoreFormatter.pretty(value)} <span style={{color: scoreToColor(value)}}>●</span></>
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
