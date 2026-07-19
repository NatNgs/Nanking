import { useMemo, useEffect } from 'react'
import './EntriesPanel.css'
import { apiGet } from '../../hooks/useApi.js'

function EntriesPanel({userScores, setUserScores, scoreFormatter, isOpen, onToggle}) {
	const sortedScores = useMemo(
		() => [...userScores].sort((a, b) => b.score - a.score || b.globalScore - a.globalScore),
		[userScores],
	)

	// Call api /user/me to update userScores every 10 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			if(isOpen) {
				apiGet('/user/me').then((data) => {
					setUserScores(data.user_scores || [])
				})
			}
		}, 10000)
		return () => clearInterval(interval)
	}, [setUserScores])

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
								<th>Personal</th>
								<th>Global</th>
							</tr>
						</thead>
						<tbody>
							{sortedScores.map((entry) => (
								<tr key={entry.id}>
									<td>{entry.label}</td>
									<td class="scoreCol">{scoreFormatter.pretty(entry.score)}</td>
									<td class="scoreCol">{scoreFormatter.pretty(entry.globalScore)}</td>
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
