import { useMemo } from 'react'
import './EntriesPanel.css'

function EntriesPanel({userScores, scoreFormatter, isOpen, onToggle}) {
	const sortedScores = useMemo(
		() => [...userScores].sort((a, b) => b.cur - a.cur || b.man - a.man),
		[userScores],
	)

	return (
		<>
			<button
				type="button"
				className={'entries-panel-toggle' + (isOpen ? '' : ' entries-panel-toggle-closed')}
				onClick={onToggle}
			>
				{isOpen ? '>' : '<'}
			</button>
			{isOpen && (
				<aside className="entries-panel">
					<table>
						<thead>
							<tr>
								<th>Entry</th>
								<th>Manual</th>
								<th>Computed</th>
							</tr>
						</thead>
						<tbody>
							{sortedScores.map((entry) => (
								<tr key={entry.id}>
									<td>{entry.label}</td>
									<td class="scoreCol">{scoreFormatter.pretty(entry.man)}</td>
									<td class="scoreCol">{scoreFormatter.pretty(entry.cur)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</aside>
			)}
		</>
	)
}

export default EntriesPanel
