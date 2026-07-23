import { useState } from 'react'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiDelete } from '../../hooks/useApi.js'
import { usePaginatedList } from '../../hooks/usePaginatedList.js'
import EntrySpan from '../entry/EntrySpan.jsx'
import PaginationControls from '../pagination/PaginationControls.jsx'
import './RecentVotesTable.css'

function voteKey(vote) {
	return vote.type === 'direct' ? 'direct_' + vote.entry : 'dual_' + vote.neg + '_' + vote.pos
}

/**
 * Renders the current user's quiz (vote) history, newest first - the fixed,
 * server-side order backing computeUserScores (see user.js getQuizPaginated),
 * never user-sortable. Shared by AccountPage ("My inputs", the full paginated
 * history with a rank column) and the compact "recent inputs" mini-tables on
 * NewEntryForm/DualQuiz (5 per page of a single type).
 *
 * `type` ('direct' | 'dual', optional) filters to one quiz kind.
 * `limit`/`showPagination` control whether this is the compact or full view.
 * `showRank` shows each vote's fixed 1-based position in the FULL,
 * chronological (oldest-first) history - stable across type filters/pages.
 */
function RecentVotesTable({scoreFormatter, type, limit = 100, showPagination = false, showRank = false}) {
	const {entriesVersion, refreshUserData, bumpEntriesVersion} = useUserContext()
	const {items, page, total, limit: pageLimit, goToPage, refetch} = usePaginatedList('/user/me/quiz', {
		limit, extraParams: type ? {type} : undefined, dependsOn: entriesVersion,
	})
	const [deletingKey, setDeletingKey] = useState(null)

	async function onDelete(vote) {
		setDeletingKey(voteKey(vote))
		try {
			await apiDelete('/quiz/' + vote.type, vote)
			await refreshUserData()
			bumpEntriesVersion()
			await refetch()
		} finally {
			setDeletingKey(null)
		}
	}

	if(items.length === 0) return null

	return (
		<div className="recent-votes-table-container">
			<table className="recent-votes-table">
				<thead>
					<tr>
						{showRank && <th className="rankCol">#</th>}
						<th>Type</th>
						<th>Detail</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{items.map((vote) => {
						const key = voteKey(vote)
						const isBeingDeleted = deletingKey === key
						return (
							<tr key={key} className={isBeingDeleted ? 'beingDeleted' : ''}>
								{showRank && <td className="rankCol">{vote.rank}</td>}
								<td>{vote.type}</td>
								<td>
									<div className="voteDetail">{vote.type === 'direct'
										? (<><EntrySpan id={vote.entry} label={vote.entryLabel} title={vote.entryLabel} /> =&gt; <span className="entryScore">{scoreFormatter.pretty(vote.value)}</span></>)
										: (<>
										<EntrySpan id={vote.neg} label={vote.negLabel} title={vote.negLabel} /> <span className="dualOperator">{vote.value < 0 ? '>' : vote.value === 0 ? '=' : '<'}</span> <EntrySpan id={vote.pos} label={vote.posLabel} title={vote.posLabel} />
										</>)
									}</div>
								</td>
								<td className="actionsCol"><button disabled={deletingKey != null} onClick={() => onDelete(vote)} className="deleteButton" title="Remove">🗙</button></td>
							</tr>
						)
					})}
				</tbody>
			</table>
			{showPagination && <PaginationControls page={page} total={total} limit={pageLimit} onPageChange={goToPage}/>}
		</div>
	)
}

export default RecentVotesTable
