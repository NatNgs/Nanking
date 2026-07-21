import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { Jimp } from 'jimp'
import CONFIG from '../../../src/server/config/config.js'
import { Entry } from '../../../src/server/data/entries.js'
import { processImageUpload, saveEntryImage, deleteEntryImage, EntryImageError } from '../../../src/server/services/entryImageService.js'

// Isolate from the real ./data directory (and from other test files sharing the
// same CONFIG singleton) with a directory of this file's own: entryImageService
// reads CONFIG.DATA_DIR lazily on each call, so mutating it here is enough.
CONFIG.DATA_DIR = 'test/tmp/data-entryImageService'
const IMAGES_DIR = CONFIG.DATA_DIR + '/entryImages'

async function makePngBuffer(width, height) {
	const image = new Jimp({width, height, color: 0xff0000ff})
	return image.getBuffer('image/png')
}

describe('processImageUpload', () => {
	test('rejects a buffer larger than 5MB', async () => {
		const oversized = Buffer.alloc(5 * 1024 * 1024 + 1)
		await assert.rejects(() => processImageUpload(oversized), EntryImageError)
	})

	test('rejects a buffer that is not a valid image', async () => {
		await assert.rejects(() => processImageUpload(Buffer.from('not an image')), EntryImageError)
	})

	test('converts a valid image to PNG', async () => {
		const input = await makePngBuffer(50, 50)
		const output = await processImageUpload(input)
		const decoded = await Jimp.read(output)
		assert.equal(decoded.width, 50)
		assert.equal(decoded.height, 50)
	})

	test('downscales an oversized image to fit within 200x200, preserving ratio', async () => {
		const input = await makePngBuffer(400, 200)
		const output = await processImageUpload(input)
		const decoded = await Jimp.read(output)
		assert.ok(decoded.width <= 200)
		assert.ok(decoded.height <= 200)
		assert.equal(decoded.width, 200)
		assert.equal(decoded.height, 100)
	})

	test('never upscales an image already smaller than 200x200', async () => {
		const input = await makePngBuffer(50, 30)
		const output = await processImageUpload(input)
		const decoded = await Jimp.read(output)
		assert.equal(decoded.width, 50)
		assert.equal(decoded.height, 30)
	})
})

describe('saveEntryImage / deleteEntryImage', () => {
	afterEach(() => {
		rmSync(IMAGES_DIR, {recursive: true, force: true})
	})

	test('saveEntryImage writes the file under a per-prefix subdirectory and returns its public URL', async () => {
		const buffer = await makePngBuffer(10, 10)
		const url = await saveEntryImage('n:42', buffer)
		assert.equal(url, '/entryImages/n/42.png')
		assert.ok(existsSync(IMAGES_DIR + '/n/42.png'))
	})

	test('saveEntryImage isolates entries imported from another source in its own subdirectory', async () => {
		const buffer = await makePngBuffer(10, 10)
		const url = await saveEntryImage('mal:42', buffer)
		assert.equal(url, '/entryImages/mal/42.png')
		assert.ok(existsSync(IMAGES_DIR + '/mal/42.png'))
	})

	test('deleteEntryImage removes the file referenced by entry.image', async () => {
		const buffer = await makePngBuffer(10, 10)
		await saveEntryImage('n:42', buffer)
		const entry = new Entry('n:42', 'Test')
		entry.image = '/entryImages/n/42.png'

		deleteEntryImage(entry)

		assert.equal(existsSync(IMAGES_DIR + '/n/42.png'), false)
	})

	test('deleteEntryImage does nothing when the entry still has the default placeholder image', () => {
		const entry = new Entry('n:42', 'Test')
		assert.doesNotThrow(() => deleteEntryImage(entry))
	})

	test('deleteEntryImage does nothing when the file does not exist on disk', () => {
		const entry = new Entry('n:42', 'Test')
		entry.image = '/entryImages/n/missing.png'
		assert.doesNotThrow(() => deleteEntryImage(entry))
	})

	test('deleteEntryImage never deletes a path outside the managed entryImages directory', () => {
		mkdirSync(CONFIG.DATA_DIR, {recursive: true})
		const outsidePath = CONFIG.DATA_DIR + '/outside.txt'
		writeFileSync(outsidePath, 'do not delete me')
		const entry = new Entry('n:42', 'Test')
		entry.image = '/outside.txt'

		deleteEntryImage(entry)

		assert.ok(existsSync(outsidePath))
		rmSync(outsidePath)
	})
})
