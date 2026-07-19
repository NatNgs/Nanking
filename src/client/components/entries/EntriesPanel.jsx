import { useMemo, useEffect, useState } from 'react'
import './EntriesPanel.css'
import { apiGet } from '../../hooks/useApi.js'
import { useCurrentUser } from '../../hooks/useCurrentUser.js'

function EntriesPanel({scoreFormatter, isOpen, onToggle}) {
	// Only show panel when screen is wide enough (desktop mode)
	const {username, userScores, userVotes, refreshUserData} = useCurrentUser()
	const [isToBeDisplayed, setToBeDisplayed] = useState(window.innerWidth > 1000)
	const updateMedia = () => setToBeDisplayed(window.innerWidth > 1000)
	useEffect(() => window.addEventListener('resize', updateMedia), [updateMedia])

	const sortedScores = useMemo(
		() => [...userScores].sort((a, b) => b.score - a.score || b.globalScore - a.globalScore),
		[userScores],
	)

	// Call api /user/me to update userScores every 30 seconds
	useEffect(() => {
		let timeout = null
		const call = () => {
			refreshUserData()
			timeout = setTimeout(call, 30000)
		}
		call()
		return () => {
			if(timeout) clearTimeout(timeout)
		}
	}, [])

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
				<div class="tableContainer">
					<table>
						<thead>
							<tr>
								<th>Entry</th>
								<th>Score</th>
								<th>Global</th>
							</tr>
						</thead>
						<tbody>
							{sortedScores.map((entry) => (
								<tr key={entry.id}>
									<td>{entry.label}</td>
									<td class="scoreCol">{scoreFormatter.pretty(entry.score)} <span style={{color:scoreToColor(entry.score)}}>●</span></td>
									<td class="scoreCol">{scoreFormatter.pretty(entry.globalScore)} <span style={{color:scoreToColor(entry.globalScore)}}>●</span></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</aside>
		)}
		</>
	)
}

export default EntriesPanel
