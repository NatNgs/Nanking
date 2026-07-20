import { Jimp } from 'jimp'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import CONFIG from '../config/config.js'

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024
const MAX_SIDE = 200

class EntryImageError extends Error {}

function imagesDir() {
	return CONFIG.DATA_DIR + '/entryImages'
}

/**
 * Validates and normalizes an uploaded image: rejects oversized or unreadable
 * buffers, converts to PNG, and downscales to fit within 200x200 without
 * ever upscaling a smaller image (aspect ratio preserved).
 */
async function processImageUpload(buffer) {
	if(buffer.length > MAX_UPLOAD_SIZE) {
		throw new EntryImageError('Image too large')
	}

	let image
	try {
		image = await Jimp.read(buffer)
	} catch {
		throw new EntryImageError('Invalid image')
	}

	if(image.width > MAX_SIDE || image.height > MAX_SIDE) {
		image = image.scaleToFit({w: MAX_SIDE, h: MAX_SIDE})
	}

	return image.getBuffer('image/png')
}

/**
 * Persists the given PNG buffer as the image for `entryId`, overwriting any
 * previous file of the same name. Returns the public URL to store on the entry.
 */
async function saveEntryImage(entryId, pngBuffer) {
	mkdirSync(imagesDir(), {recursive: true})
	const filename = entryId + '.png'
	await writeFile(imagesDir() + '/' + filename, pngBuffer)
	return '/entryImages/' + filename
}

/**
 * Deletes the entry's custom image file from disk, if any. Never touches the
 * default placeholder image, and never deletes outside the managed directory.
 */
function deleteEntryImage(entry) {
	if(!entry.image || entry.image === 'assets/unknown.svg') return
	if(!entry.image.startsWith('/entryImages/')) return

	const path = CONFIG.DATA_DIR + entry.image
	if(existsSync(path)) unlinkSync(path)
}

export { processImageUpload, saveEntryImage, deleteEntryImage, EntryImageError }
