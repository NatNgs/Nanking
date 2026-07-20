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
			<h1>{entry.name}</h1>
			<img className="entry-page-image" src={entry.image} alt={entry.name} />
			{isAuthenticated && (
				<>
					<div className="entry-page-actions">
						<label className="entry-page-image-upload">
							Modifier l'image
							<input type="file" accept={ACCEPTED_IMAGE_TYPES} onChange={onImageFileSelected} hidden />
						</label>
						<button onClick={onRename}>Renommer</button>
						<button onClick={onDelete}>Supprimer</button>
					</div>
					<p className="entry-page-help">Formats acceptés : PNG, JPEG, BMP, GIF, TIFF (5MB maximum)</p>
				</>
			)}
			{error && <p role="alert" className="entry-page-error">{error}</p>}

			<p>Score global : {scoreFormatter.pretty(entry.globalScore)}</p>
			{isAuthenticated && entry.userScore != null && (
				<p>{username} : {scoreFormatter.pretty(entry.userScore)}</p>
			)}
		</div>
	)
}

export default EntryPage
export { entryLoader }
