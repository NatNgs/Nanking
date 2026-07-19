import { useMemo } from 'react'
import { useLoaderData, useOutletContext } from 'react-router'
import { apiGet } from '../../hooks/useApi.js'
import { FORMATTERS } from '../../lib/scoreFormatter.js'
import './ProfilePage.css'

async function profileLoader({params}) {
	try {
		return await apiGet('/user/' + params.username)
	} catch(err) {
		if(err.status === 404) throw new Response('user', {status: 404})
		throw err
	}
}

function ProfilePage() {
	const {scoreFormatter} = useOutletContext()
	const {username, user_scores} = useLoaderData()

	const sortedScores = useMemo(
		() => [...user_scores].sort((a, b) => b.score - a.score),
		[user_scores],
	)

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
		<div className="profile-page">
			<h1>{username}</h1>
			<table>
				<thead>
					<tr>
						<th>Entry</th>
						<th>Score</th>
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
		</div>
	)
}

export default ProfilePage
export { profileLoader }
