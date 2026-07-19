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

	// Call api /user/me to update userScores every 30 seconds
	useEffect(() => {
		let timeout;
		const call = () => {
			apiGet('/entries').then((data) => {
				setGlobalScores(data || [])
				timeout = setTimeout(call, 30000)
			}).catch((e) => {
				// In case of TooManyRequests 429, set to retry after header 'Retry-After' seconds (min=30s)
				if(e.response.status === 429) {
					const retryAfter = Math.max(e.response.headers['retry-after'] || 60, 30)
					timeout = setTimeout(call, retryAfter * 1000)
				}
			})
		}
		call()
		return () => (timeout && clearTimeout(timeout))
	}, [setGlobalScores])

	function scoreToColor(score) {
		// Score is from 0 to 1
		// Convert it to a color: 0 => #000000, 0.3 => #FF0000, 0.6 => #FFFF00, 0.9 => #00AA00, 1 => #00AAFF
		const colors = [{step:0, r:0, g:0, b:0}, {step:0.3, r:255, g:0, b:0}, {step:0.6, r:255, g:255, b:0}, {step:0.9, r:0, g:170, b:0}, {step:1, r:0, g:170, b:255}]

		// Find the two colors around current score
		let i = 1
		while(score > colors[i].step && i < colors.length - 1) {
			i++
		}

		// Interpolate between the two colors
		const prevColor = colors[i-1]
		const nextColor = colors[i]
		const r = Math.round(prevColor.r + (nextColor.r - prevColor.r) * (score - prevColor.step) / (nextColor.step - prevColor.step))
		const g = Math.round(prevColor.g + (nextColor.g - prevColor.g) * (score - prevColor.step) / (nextColor.step - prevColor.step))
		const b = Math.round(prevColor.b + (nextColor.b - prevColor.b) * (score - prevColor.step) / (nextColor.step - prevColor.step))
		return `rgb(${r},${g},${b})`
	}

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
						<td class="scoreCol">{scoreFormatter.pretty(entry.score)} <span style={{color:scoreToColor(entry.score)}}>●</span></td>
					</tr>
				))}
			</tbody>
		</table>
	)
}

export default GlobalScoresPanel
