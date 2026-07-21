import { useLoaderData, useOutletContext } from 'react-router'
import { apiGet, loadOr404 } from '../../hooks/useApi.js'
import { usePaginatedList } from '../../hooks/usePaginatedList.js'
import ScoreTable from '../../components/scoreTable/ScoreTable.jsx'
import PaginationControls from '../../components/pagination/PaginationControls.jsx'
import './ProfilePage.css'

const COLUMNS = [{column: 'Score', sortKey: 'score', score: (e) => e.score}]

async function profileLoader({params, request}) {
	// Only validates the account exists (404 otherwise); the actual paginated
	// fetch is handled by usePaginatedList in the component below.
	await loadOr404(() => apiGet('/user/' + params.username, {limit: 1}, {signal: request.signal}), 'user')
	return {username: params.username}
}

function ProfilePage() {
	const {scoreFormatter} = useOutletContext()
	const {username} = useLoaderData()
	const {items, sort, order, onSort, page, total, limit, goToPage} = usePaginatedList('/user/' + username, {
		initialSort: 'score', initialOrder: 'desc',
	})

	return (
		<div className="profile-page">
			<h1>{username}</h1>
			<ScoreTable items={items} columns={COLUMNS} sort={sort} order={order} onSort={onSort} scoreFormatter={scoreFormatter}/>
			<PaginationControls page={page} total={total} limit={limit} onPageChange={goToPage}/>
		</div>
	)
}

export default ProfilePage
export { profileLoader }
