import { useState } from 'react'
import { useLoaderData, useOutletContext, useNavigate } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiGet, apiPatch, apiDelete } from '../../hooks/useApi.js'
import './EntryPage.css'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = 'image/png,image/jpeg,image/bmp,image/gif,image/tiff'

async function entryLoader({params, request}) {
	try {
		return await apiGet('/entry/' + params.entryId, null, {signal: request.signal})
	} catch(err) {
		if(err.status === 404) throw new Response('entry', {status: 404})
		throw err
	}
}

function EntryPage() {
	const initialEntry = useLoaderData()
	const {scoreFormatter} = useOutletContext()
	const {isAuthenticated, username, refreshUserData} = useUserContext()
	const navigate = useNavigate()

	const [entry, setEntry] = useState(initialEntry)
	const [error, setError] = useState(null)

	async function onImageFileSelected(e) {
		const file = e.target.files?.[0]
		e.target.value = ''
		if(!file) return

		if(file.size > MAX_IMAGE_SIZE) {
			setError('Image trop lourde (5MB maximum)')
			return
		}

		try {
			setError(null)
			const formData = new FormData()
			formData.append('image', file)
			const updated = await apiPatch('/entry/' + entry.id + '/image', formData)
			if(updated) setEntry(updated)
		} catch {
			setError('Échec de l\'envoi de l\'image')
		}
	}

	async function onRename() {
		const newName = window.prompt('Nouveau nom pour "' + entry.name + '"', entry.name)
		if(newName == null) return
		const trimmed = newName.trim()
		if(!trimmed || trimmed === entry.name) return

		try {
			const updated = await apiPatch('/entry/' + entry.id + '/name', {name: trimmed})
			setEntry(updated)
		} catch(err) {
			if(err.response?.status === 409) alert('Une entry avec ce nom existe déjà')
			else alert('Échec du renommage')
		}
	}

	async function onDelete() {
		if(!window.confirm('Supprimer "' + entry.name + '" ? Cette action est irréversible.')) return
		await apiDelete('/entry/' + entry.id)
		await refreshUserData()
		navigate('/')
	}

	return (
		<div className="entry-page">
			<div className="entry-page-title">
				<h1>{entry.name}</h1>
				{isAuthenticated && entry.userScore && (<button onClick={onRename}>Rename</button>)}
			</div>
			<div className="entry-page-image-container">
				<img className="entry-page-image" src={"/api/entry/" + entry.id + "/image.png"} alt={entry.name} />
				<div>{isAuthenticated && entry.userScore && (<>
					<label className="entry-page-image-upload" for="entry-page-image-uploader">Upload a new picture</label>
					<input type="file" id="entry-page-image-uploader" accept={ACCEPTED_IMAGE_TYPES} onChange={onImageFileSelected} hidden />
					<p className="entry-page-help">Accepts : PNG, JPEG, BMP, GIF, TIFF (5MB maximum)<br/>Preffered dimensions: 200x200px (other will be resized)</p>
				</>)}
				</div>
			</div>
			{error && <p role="alert" className="entry-page-error">{error}</p>}

			<p>Global score : {scoreFormatter.pretty(entry.globalScore)}</p>
			{isAuthenticated && entry.userScore != null && (
				<p>
					<span>{username} : {scoreFormatter.pretty(entry.userScore)}</span>
					&nbsp;
					<button onClick={onDelete}>Remove it from my scores</button>
				</p>
			)}
		</div>
	)
}

export default EntryPage
export { entryLoader }
