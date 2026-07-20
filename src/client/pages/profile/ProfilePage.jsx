import { useLoaderData, useOutletContext } from 'react-router'
import { apiGet } from '../../hooks/useApi.js'
import ScoreTable from '../../components/scoreTable/ScoreTable.jsx'
import './ProfilePage.css'

const COLUMNS = [{column: 'Score', score: (e) => e.score, sortOrder: 1}]

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

	return (
		<div className="profile-page">
			<h1>{username}</h1>
			<ScoreTable entries={user_scores} columns={COLUMNS} scoreFormatter={scoreFormatter}/>
		</div>
	)
}

export default ProfilePage
export { profileLoader }
