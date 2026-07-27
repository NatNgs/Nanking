import { useState, useEffect, useRef } from 'react'
import { useLoaderData, useOutletContext, useNavigate, useParams } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiGet, apiPatch, apiDelete, apiPost, loadOr404 } from '../../hooks/useApi.js'
import { useRenamePrompt } from '../../hooks/useRenamePrompt.js'
import TagPicker from '../../components/tag/TagPicker.jsx'
import TagSpan from '../../components/tag/TagSpan.jsx'
import PromptModal from '../../components/common/PromptModal.jsx'
import AlertModal from '../../components/common/AlertModal.jsx'
import ConfirmModal from '../../components/common/ConfirmModal.jsx'
import './EntryPage.css'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/bmp,image/gif,image/tiff'

async function entryLoader({params, request}) {
	return loadOr404(() => apiGet('/entry/' + params.entryId, null, {signal: request.signal}), 'entry')
}

function EntryPage() {
	const initialEntry = useLoaderData()
	const {entryId} = useParams()
	const {scoreFormatter} = useOutletContext()
	const {isAuthenticated, username, refreshUserData, bumpEntriesVersion} = useUserContext()
	const navigate = useNavigate()

	const [entry, setEntry] = useState(initialEntry)
	const [error, setError] = useState(null)
	const [imageVersion, setImageVersion] = useState(0)
	const [isUploadingImage, setIsUploadingImage] = useState(false)
	const [isRemovingScore, setIsRemovingScore] = useState(false)
	const [isEditingTags, setIsEditingTags] = useState(false)

	const {isRenaming, rename: onRename, promptModalProps, alertModalProps} = useRenamePrompt({
		currentValue: entry.name,
		promptMessage: 'New name for',
		patch: (name) => apiPatch('/entry/' + entry.id + '/name', {name}).then(setEntry),
		conflictMessage: 'An entry with this name already exists',
		failMessage: 'Rename failed',
	})
	const [showRemoveScoreConfirm, setShowRemoveScoreConfirm] = useState(false)

	// Re-fetches this entry whenever the user logs in/out (userScore is only
	// present for an authenticated user, and login state can change from the
	// header without this page re-mounting). Skips the very first render:
	// the loader already fetched a fresh copy for the initial isAuthenticated state.
	const isFirstRender = useRef(true)
	useEffect(() => {
		if(isFirstRender.current) {
			isFirstRender.current = false
			return
		}
		const controller = new AbortController()
		apiGet('/entry/' + entryId, null, {signal: controller.signal}).then(setEntry).catch(() => {
			// Ignored: a transient failure (including this effect's own abort on
			// cleanup) here just keeps showing the last known state.
		})
		return () => controller.abort()
	}, [entryId, isAuthenticated])

	const isBusy = isRenaming || isUploadingImage || isRemovingScore || isEditingTags
	// An Admin can edit any entry (rename, image, tags) even without a personal
	// score on it - see README's "Create a user Admin boolean" - unlike
	// "Remove it from my scores" below, which only makes sense with one.
	const canEdit = isAuthenticated && (entry.userScore != null || entry.isAdmin)

	async function onImageFileSelected(e) {
		const file = e.target.files?.[0]
		e.target.value = ''
		if(!file) return

		if(file.size > MAX_IMAGE_SIZE) {
			setError('Image too large (5MB maximum)')
			return
		}

		setIsUploadingImage(true)
		try {
			setError(null)
			const formData = new FormData()
			formData.append('image', file)
			const updated = await apiPatch('/entry/' + entry.id + '/image', formData)
			if(updated) {
				setEntry(updated)
				setImageVersion((v) => v + 1)
			}
		} catch {
			setError('Failed to upload image')
		} finally {
			setIsUploadingImage(false)
		}
	}

	async function onAddTag(tagId) {
		setIsEditingTags(true)
		try {
			setError(null)
			const updated = await apiPost('/entry/' + entry.id + '/tags', {tagId})
			setEntry(updated)
		} catch {
			setError('Failed to add tag')
		} finally {
			setIsEditingTags(false)
		}
	}

	async function onRemoveTag(tagId) {
		setIsEditingTags(true)
		try {
			setError(null)
			const updated = await apiDelete('/entry/' + entry.id + '/tags/' + tagId)
			setEntry(updated)
		} catch {
			setError('Failed to remove tag')
		} finally {
			setIsEditingTags(false)
		}
	}

	function onRemoveScore() {
		setShowRemoveScoreConfirm(true)
	}

	async function confirmRemoveScore() {
		setShowRemoveScoreConfirm(false)
		setIsRemovingScore(true)
		try {
			await apiDelete('/entry/' + entry.id)
			await refreshUserData()
			bumpEntriesVersion()
			navigate('/')
		} catch {
			setError('Failed to remove')
			setIsRemovingScore(false)
		}
	}

	return (
		<div className="entry-page">
			<div className="entry-page-title">
				<h1>{entry.name}</h1>
				{canEdit && (<button disabled={isBusy} onClick={onRename}>Rename</button>)}
			</div>
			<div className="entry-page-image-container">
				<img
					className="entry-page-image"
					src={`/api/entry/${entry.id}/image.png?v=${imageVersion}`}
					alt={entry.name}
				/>
				<div>{canEdit && (<>
					<label
						className={`entry-page-image-upload${isBusy ? ' disabled' : ''}`}
						for={isBusy ? undefined : 'entry-page-image-uploader'}
					>Upload a new picture</label>
					<input
						type="file" id="entry-page-image-uploader" accept={ACCEPTED_IMAGE_TYPES}
						onChange={onImageFileSelected} disabled={isBusy} hidden
					/>
					<p className="entry-page-help">
						Accepts : PNG, JPEG, BMP, GIF, TIFF (5MB maximum)<br/>
						Preffered dimensions: 200x200px (other will be resized)
					</p>
				</>)}
				</div>
			</div>
			{error && <p role="alert" className="entry-page-error">{error}</p>}

			<div className="entry-page-tags">
				{entry.tags.map((tag) => (
					<span key={tag.id} className="entry-page-tag">
						<TagSpan id={tag.id} label={tag.label} />
						{canEdit && <button disabled={isBusy} onClick={() => onRemoveTag(tag.id)}>x</button>}
					</span>
				))}
				{canEdit && (
					<TagPicker
						searchFilter={{notOnEntity: entry.id}}
						onAdd={onAddTag}
						disabled={isBusy}
						placeholder="Add a tag..."
						className="entry-tag-picker"
					/>
				)}
			</div>

			<p>Global score : {scoreFormatter.pretty(entry.globalScore)}</p>
			{isAuthenticated && entry.userScore != null && (
				<p>
					<span>{username} : {scoreFormatter.pretty(entry.userScore)}</span>
					&nbsp;
					<button disabled={isBusy} onClick={onRemoveScore}>Remove it from my scores</button>
				</p>
			)}

			{promptModalProps.show && <PromptModal {...promptModalProps} />}
			{alertModalProps.show && <AlertModal {...alertModalProps} />}
			{showRemoveScoreConfirm && (
				<ConfirmModal
					message={'Remove "' + entry.name + '"? This action is irreversible.'}
					onConfirm={confirmRemoveScore}
					onCancel={() => setShowRemoveScoreConfirm(false)}
				/>
			)}
		</div>
	)
}

export default EntryPage
export { entryLoader }
