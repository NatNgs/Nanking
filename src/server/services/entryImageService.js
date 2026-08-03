import { Jimp } from 'jimp'
import sharp from 'sharp'
import { mkdirSync, unlinkSync, existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import CONFIG from '../config/config.js'

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024
const MAX_SIDE = 200
const MAX_ASPECT_RATIO = 4

class EntryImageError extends Error {}

function imagesDir() {
	return CONFIG.DATA_DIR + '/entryImages'
}

/**
 * Resolves the on-disk path of `entryId`'s image file, one subdirectory per
 * source prefix (e.g. `n:0` -> `<dataDir>/entryImages/n/0.png`).
 */
function getEntryImageFilePath(entryId) {
	return imagesDir() + '/' + String(entryId).replace(':', '/') + '.png'
}

/**
 * Validates and normalizes an uploaded image: rejects oversized or unreadable
 * buffers, converts to PNG, and resizes it to a square-ish 200px thumbnail.
 *
 * If the image's largest side is already under 200px, it is left as-is
 * (never upscaled) - only converted to PNG. Otherwise, the largest side is
 * first cropped by half, centered (e.g. a portrait image has its top and
 * bottom trimmed equally), shrinking the gap between both sides by half
 * before the whole image is scaled down so its largest side becomes exactly
 * 200px - a plain scaleToFit would keep a very elongated image's aspect
 * ratio (e.g. a 1000x100 poster shrinks to 200x20), this crop step brings
 * every thumbnail closer to a 200x200 square first. The smallest side is
 * never treated as narrower than 200px for this crop calculation (even if it
 * actually is), or a very elongated image would get cropped down to almost
 * nothing before the resize.
 *
 * Also rejects an image whose largest side is more than 4x its smallest
 * (e.g. a 800x100 banner): the crop step above only trims the gap by half,
 * so anything beyond that ratio would still end up cropped down to a sliver
 * before the resize - better to reject upfront than silently produce a
 * near-unusable thumbnail.
 */
async function processImageUpload(buffer) {
	if(buffer.length > MAX_UPLOAD_SIZE) {
		throw new EntryImageError('Image too large')
	}

	let image
	try {
		image = await Jimp.read(buffer)
	} catch {
		// Jimp has no built-in webp decoder - retry via sharp (libvips), which
		// does, converting to PNG first so Jimp can take over for the resize.
		try {
			const pngBuffer = await sharp(buffer).png().toBuffer()
			image = await Jimp.read(pngBuffer)
		} catch {
			throw new EntryImageError('Invalid image')
		}
	}

	const largestSide = Math.max(image.width, image.height)
	const smallestSideRaw = Math.min(image.width, image.height)
	if(largestSide > smallestSideRaw * MAX_ASPECT_RATIO) {
		throw new EntryImageError('Image aspect ratio too extreme')
	}

	if(largestSide > MAX_SIDE) {
		const smallestSide = Math.max(smallestSideRaw, MAX_SIDE)
		// Total amount trimmed off the largest side (x' = x - (x-y)/2), split
		// evenly between both ends so the kept block stays centered.
		const gap = largestSide - smallestSide
		const cropAmount = Math.round(gap / 2)
		const cropPerSide = Math.round(cropAmount / 2)
		if(image.width > image.height) {
			image = image.crop({x: cropPerSide, y: 0, w: image.width - cropAmount, h: image.height})
		} else {
			image = image.crop({x: 0, y: cropPerSide, w: image.width, h: image.height - cropAmount})
		}
		image = image.scaleToFit({w: MAX_SIDE, h: MAX_SIDE})
	}

	return image.getBuffer('image/png')
}

/**
 * Persists the given PNG buffer as the image for `entryId`, overwriting any
 * previous file of the same name. Entries are stored one subdirectory per
 * source prefix (e.g. `n:0` -> `n/0.png`, `mal:12345` -> `mal/12345.png`),
 * so imports from different sources never collide. Returns the public URL
 * to store on the entry.
 */
async function saveEntryImage(entryId, pngBuffer) {
	const filePath = getEntryImageFilePath(entryId)
	mkdirSync(dirname(filePath), {recursive: true})

	await writeFile(filePath, pngBuffer)
	return filePath.slice(CONFIG.DATA_DIR.length)
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

export { processImageUpload, saveEntryImage, deleteEntryImage, getEntryImageFilePath, EntryImageError }
