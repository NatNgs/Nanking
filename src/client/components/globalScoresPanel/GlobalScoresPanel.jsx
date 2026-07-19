import { useState, useMemo, useEffect } from 'react'
import './GlobalScoresPanel.css'
import { apiGet } from '../../hooks/useApi.js'

function GlobalScoresPanel({scoreFormatter}) {
	// Define globalScores
	const [globalScores, setGlobalScores] = useState([])

	const sortedScores = useMemo(
		() => [...globalScores].sort((a, b) => b.score - a.score),
		[globalScores],
	)

	// Call api /user/me to update userScores every 10 seconds
	useEffect(() => {
		let i;
		const call = () => {
			apiGet('/entries').then((data) => {
				setGlobalScores(data || [])
			})
			i = setTimeout(call, 10000)
		}
		call()
		return () => (i && clearTimeout(i))
	}, [setGlobalScores])

	return (
		<table>
			<thead>
				<tr>
					<th>Entry</th>
					<th>Global score</th>
				</tr>
			</thead>
			<tbody>
				{sortedScores.map((entry) => (
					<tr key={entry.id}>
						<td>{entry.label}</td>
						<td class="scoreCol">{scoreFormatter.pretty(entry.score)}</td>
					</tr>
				))}
			</tbody>
		</table>
	)
}

export default GlobalScoresPanel
