import { useState, useEffect } from 'react'
import { useLoaderData, useParams, useOutletContext } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiGet, apiPatch, apiPost, apiDelete, loadOr404 } from '../../hooks/useApi.js'
import { usePaginatedList } from '../../hooks/usePaginatedList.js'
import { useRenamePrompt } from '../../hooks/useRenamePrompt.js'
import TagTree from '../../components/tag/TagTree.jsx'
import TagPicker from '../../components/tag/TagPicker.jsx'
import ScoreTable from '../../components/scoreTable/ScoreTable.jsx'
import PaginationControls from '../../components/pagination/PaginationControls.jsx'
import PromptModal from '../../components/common/PromptModal.jsx'
import AlertModal from '../../components/common/AlertModal.jsx'
import './TagPage.css'

const ENTRIES_COLUMNS = [
	{column: 'Global score', sortKey: 'globalScore', score: (e) => e.globalScore},
	{column: 'Score', sortKey: 'score', score: (e) => e.score},
]

async function tagLoader({params, request}) {
	return loadOr404(async () => {
		const [tag, tree] = await Promise.all([
			apiGet('/tag/' + params.tagId, null, {signal: request.signal}),
			apiGet('/tag/' + params.tagId + '/tree', null, {signal: request.signal}),
		])
		return {tag, tree}
	}, 'tag')
}

function TagPage() {
	const {tag: initialTag, tree: initialTree} = useLoaderData()
	const {tagId} = useParams()
	const {isAuthenticated} = useUserContext()
	const {scoreFormatter} = useOutletContext()

	const [tag, setTag] = useState(initialTag)
	const [tree, setTree] = useState(initialTree)
	const [isBusy, setIsBusy] = useState(false)
	const [error, setError] = useState(null)

	const {
		items: entries, sort: entriesSort, order: entriesOrder, onSort: onSortEntries,
		page: entriesPage, total: entriesTotal, limit: entriesLimit, goToPage: goToEntriesPage,
	} = usePaginatedList('/tag/' + tagId + '/entries', {
		initialSort: 'globalScore', initialOrder: 'desc',
	})

	// react-router reuses this same component instance across /tag/:tagId
	// navigations (e.g. clicking a parent/child link in TagTree): the loader
	// re-runs and useLoaderData() updates, but local state initialized from it
	// via useState() only picks up that initial value once. Without this, the
	// URL changes but the page keeps showing the previous tag. Re-sync
	// whenever the loader hands back data for a new tagId.
	useEffect(() => {
		setTag(initialTag)
		setTree(initialTree)
		setError(null)
	}, [tagId, initialTag, initialTree])

	async function refresh() {
		const [t, tr] = await Promise.all([
			apiGet('/tag/' + tagId),
			apiGet('/tag/' + tagId + '/tree'),
		])
		setTag(t)
		setTree(tr)
	}

	const {isRenaming, rename: onRename, promptModalProps, alertModalProps} = useRenamePrompt({
		currentValue: tag.label,
		promptMessage: 'New label for',
		patch: (label) => apiPatch('/tag/' + tag.id + '/label', {label}).then(setTag),
		conflictMessage: 'A tag with this label already exists',
		failMessage: 'Rename failed',
	})

	async function onAddParent(parentId) {
		setIsBusy(true)
		try {
			setError(null)
			await apiPost('/tag/' + tag.id + '/parents', {parentId})
			await refresh()
		} catch {
			setError('Failed to add parent')
		} finally {
			setIsBusy(false)
		}
	}

	async function onRemoveParent(parentId) {
		setIsBusy(true)
		try {
			setError(null)
			await apiDelete('/tag/' + tag.id + '/parents/' + parentId)
			await refresh()
		} catch {
			setError('Failed to remove parent')
		} finally {
			setIsBusy(false)
		}
	}

	const isBusyOverall = isBusy || isRenaming

	return (
		<div className="tag-page">
			<div className="tag-page-title">
				<h1>{tag.label}</h1>
				{isAuthenticated && <button disabled={isBusyOverall} onClick={onRename}>Rename</button>}
			</div>

			{error && <p role="alert" className="tag-page-error">{error}</p>}

			<TagTree
				title="Parents"
				nodes={tree.parents}
				childKey="parents"
				onRemove={isAuthenticated ? onRemoveParent : null}
			/>
			{isAuthenticated && (
				<TagPicker
					searchFilter={{notHavingAsChild: [tag.id]}}
					onAdd={onAddParent}
					disabled={isBusyOverall}
					placeholder="Add a parent tag..."
					className="tag-parent-picker"
				/>
			)}

			<TagTree title="Children" nodes={tree.children} childKey="children" />

			<h2>Linked entries ({entriesTotal})</h2>
			<ScoreTable
				items={entries}
				columns={ENTRIES_COLUMNS}
				sort={entriesSort}
				order={entriesOrder}
				onSort={onSortEntries}
				scoreFormatter={scoreFormatter}
			/>
			<PaginationControls page={entriesPage} total={entriesTotal} limit={entriesLimit} onPageChange={goToEntriesPage}/>

			{promptModalProps.show && <PromptModal {...promptModalProps} />}
			{alertModalProps.show && <AlertModal {...alertModalProps} />}
		</div>
	)
}

export default TagPage
export { tagLoader }
