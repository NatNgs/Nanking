import { useLoaderData, useOutletContext } from 'react-router'
import { apiGet, loadOr404 } from '../../hooks/useApi.js'
import ScoreTable from '../../components/scoreTable/ScoreTable.jsx'
import './ProfilePage.css'

const COLUMNS = [{column: 'Score', score: (e) => e.score, sortOrder: 1}]

async function profileLoader({params, request}) {
	return loadOr404(() => apiGet('/user/' + params.username, null, {signal: request.signal}), 'user')
}

function ProfilePage() {
	const {scoreFormatter} = useOutletContext()
	const {username, user_scores} = useLoaderData()

	return (
		<div className="profile-page">
			<h1>{username}</h1>
			<ScoreTable entries={user_scores} columns={COLUMNS} scoreFormatter={scoreFormatter}/>
		</div>
	)
}

export default ProfilePage
export { profileLoader }
