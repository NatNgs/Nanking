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

	return (
		<div className="profile-page">
			<h1>{username}</h1>
			<table>
				<thead>
					<tr>
						<th>Entry</th>
						<th>Computed</th>
					</tr>
				</thead>
				<tbody>
					{sortedScores.map((entry) => (
						<tr key={entry.id}>
							<td>{entry.label}</td>
							<td>{scoreFormatter.pretty(entry.score)}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

export default ProfilePage
export { profileLoader }
