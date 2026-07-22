import { useState } from 'react'
import { useLoaderData, useParams } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiGet, apiPatch, apiPost, apiDelete, loadOr404 } from '../../hooks/useApi.js'
import { useRenamePrompt } from '../../hooks/useRenamePrompt.js'
import TagTree from '../../components/tag/TagTree.jsx'
import TagPicker from '../../components/tag/TagPicker.jsx'
import EntrySpan from '../../components/entry/EntrySpan.jsx'
import PromptModal from '../../components/common/PromptModal.jsx'
import AlertModal from '../../components/common/AlertModal.jsx'
import './TagPage.css'

async function tagLoader({params, request}) {
	return loadOr404(async () => {
		const [tag, tree, entriesData] = await Promise.all([
			apiGet('/tag/' + params.tagId, null, {signal: request.signal}),
			apiGet('/tag/' + params.tagId + '/tree', null, {signal: request.signal}),
			apiGet('/tag/' + params.tagId + '/entries', null, {signal: request.signal}),
		])
		return {tag, tree, entriesData}
	}, 'tag')
}

function TagPage() {
	const {tag: initialTag, tree: initialTree, entriesData: initialEntriesData} = useLoaderData()
	const {tagId} = useParams()
	const {isAuthenticated} = useUserContext()

	const [tag, setTag] = useState(initialTag)
	const [tree, setTree] = useState(initialTree)
	const [entriesData, setEntriesData] = useState(initialEntriesData)
	const [isBusy, setIsBusy] = useState(false)
	const [error, setError] = useState(null)

	async function refresh() {
		const [t, tr, ed] = await Promise.all([
			apiGet('/tag/' + tagId),
			apiGet('/tag/' + tagId + '/tree'),
			apiGet('/tag/' + tagId + '/entries'),
		])
		setTag(t)
		setTree(tr)
		setEntriesData(ed)
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

			<h2>Linked entries ({entriesData.total})</h2>
			<div className="tag-page-entries-list">
				{entriesData.items.map((e) => (
					<EntrySpan key={e.id} id={e.id} label={e.label} />
				))}
			</div>

			{promptModalProps.show && <PromptModal {...promptModalProps} />}
			{alertModalProps.show && <AlertModal {...alertModalProps} />}
		</div>
	)
}

export default TagPage
export { tagLoader }
