import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { rmSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { startServer, stopServer, BASE_URL } from './helpers/testServer.js'
import { buildFixtureDb } from './helpers/fixtureDb.js'

// must already be lowercase: accountsModel.js normalizes it, but the fixture
// writes users.<username> as-is
const LOGIN = 'tagsintegration'
const PASSWORD = 'testtest'
const FIXTURE_DB_PATH = 'test/tmp/nanking.test.sqlite'

/**
 * Windows can hold a file lock on the previous test file's SQLite database
 * for a short while after its server process has already exited (the OS
 * hasn't released the handle yet) - stopServer() only waits for the process
 * itself to exit, not for the filesystem to catch up. Retries past a
 * transient EPERM/EBUSY instead of failing the whole suite on it.
 */
async function rmSyncWithRetry(path, retries = 10) {
	for(let attempt = 1; ; attempt++) {
		try {
			rmSync(path, {force: true})
			return
		} catch (err) {
			if(attempt >= retries || !['EPERM', 'EBUSY'].includes(err.code)) throw err
			await delay(200)
		}
	}
}

describe('Tags integration flow', {concurrency: false}, () => {
	let serverProc, browser, page

	before(async () => {
		// Any file left by a previous test in this suite must be gone before we
		// write our own fixture, and no server must be running while we do.
		await rmSyncWithRetry(FIXTURE_DB_PATH)
		await buildFixtureDb(FIXTURE_DB_PATH, LOGIN)

		serverProc = await startServer()
		browser = await chromium.launch()
		page = await browser.newPage({viewport: {width: 1280, height: 900}})
	})

	after(async () => {
		await browser?.close()
		await stopServer(serverProc)
	})

	async function registerAndLogIn() {
		await page.goto(BASE_URL + '/')
		await page.locator('.app-header-actions button:has-text("Register")').click()
		await page.locator('.login-modal-box input[type=text]').fill(LOGIN)
		await page.locator('.login-modal-box input[type=password]').fill(PASSWORD)
		await page.locator('.login-modal-box button[type=submit]').click()
		await page.locator('.user-menu-trigger').waitFor({state: 'visible', timeout: 5000})
	}

	async function gotoEntryNamed(name) {
		await page.goto(BASE_URL + '/')
		await page.locator('.entries-panel .score-table tbody tr', {has: page.locator(`td:has-text("${name}")`)})
			.locator('.entryLabel').click()
		await page.waitForURL(/\/entry\/.+/)
	}

	test('register the pre-seeded test account and log in', async () => {
		await registerAndLogIn()
	})

	test('an entry tagged in the fixture shows its direct tag as a pastille, not its inherited ones', async () => {
		await gotoEntryNamed('Whiskers')
		await page.locator('.entry-page h1', {hasText: 'Whiskers'}).waitFor({state: 'visible', timeout: 5000})

		const tagLabels = page.locator('.entry-page-tags .tagLabel')
		await tagLabels.first().waitFor({state: 'visible', timeout: 5000})
		assert.equal(await tagLabels.count(), 1)
		assert.equal((await tagLabels.first().innerText()).trim(), 'Cat')
	})

	test(
		'adding an existing tag from the picker (no creation) attaches it '
		+ 'and shows it disabled with no selection',
		async () => {
			const addButton = page.locator('.entry-tag-picker button')
			await addButton.waitFor({state: 'visible', timeout: 5000})
			assert.equal(await addButton.isDisabled(), true)

			await page.locator('.entry-tag-picker input[type=text]').click()
			await page.locator('.entry-tag-picker input[type=text]').fill('Dog')
			const option = page.getByRole('option', {name: 'Dog', exact: true})
			await option.waitFor({state: 'visible', timeout: 3000})
			await option.click()

			assert.equal(await addButton.isDisabled(), false)
			await addButton.click()

			const tagLabels = page.locator('.entry-page-tags .tagLabel')
			await page.locator('.entry-page-tags .tagLabel', {hasText: 'Dog'}).waitFor({state: 'visible', timeout: 5000})
			assert.equal(await tagLabels.count(), 2)
		})

	test('a tag already covered (an ancestor of a tag already on the entry) is not offered by the picker', async () => {
		// Whiskers already has Cat directly: Mammal/Animal/Living being are all
		// already inherited through it, and must not appear as suggestions.
		await page.locator('.entry-tag-picker input[type=text]').click()
		await page.locator('.entry-tag-picker input[type=text]').fill('Mammal')

		// No matching option should ever appear (server-filtered by notOnEntity)
		await page.waitForTimeout(1200) // let the debounced request settle
		const option = page.getByRole('option', {name: 'Mammal', exact: true})
		assert.equal(await option.count(), 0)
	})

	test('creating a brand new tag from the picker creates and attaches it immediately', async () => {
		await page.locator('.entry-tag-picker input[type=text]').fill('Fluffy')
		const newOption = page.getByRole('option', {name: '(New) Fluffy'})
		await newOption.waitFor({state: 'visible', timeout: 3000})
		await newOption.click()

		await page.locator('.entry-tag-picker button').click()
		await page.locator('.entry-page-tags .tagLabel', {hasText: 'Fluffy'}).waitFor({state: 'visible', timeout: 5000})
	})

	test('removing a direct tag makes its pastille disappear, with no crash and a finite score still shown', async () => {
		const dogTagRemoveButton = page.locator('.entry-page-tag', {hasText: 'Dog'}).locator('button')
		await dogTagRemoveButton.click()
		await page.locator('.entry-page-tags .tagLabel', {hasText: 'Dog'}).waitFor({state: 'hidden', timeout: 5000})

		const scoreText = await page.locator('p', {hasText: 'Global score'}).innerText()
		assert.doesNotMatch(scoreText, /NaN/)
	})

	test(
		'navigating to an intermediate tag page shows its parent/child tree, '
		+ 'score, and inherited linked entries',
		async () => {
			await gotoEntryNamed('Generic Mammal thing')
			await page.locator('.entry-page-tags .tagLabel', {hasText: 'Mammal'}).click()
			await page.waitForURL(/\/tag\/.+/)

			await page.locator('.tag-page h1', {hasText: 'Mammal'}).waitFor({state: 'visible', timeout: 5000})

			// Parents: Animal and Living being (multiple inheritance)
			const parentLabels = page.locator('.tag-tree', {hasText: 'Parents'}).locator('> ul > li > a.tagLabel')
			await parentLabels.first().waitFor({state: 'visible', timeout: 5000})
			const parentTexts = (await parentLabels.allInnerTexts()).sort()
			assert.deepEqual(parentTexts, ['Animal', 'Living being'])

			// Children: Cat and Dog
			const childLabels = page.locator('.tag-tree', {hasText: 'Children'}).locator('> ul > li > a.tagLabel')
			const childTexts = (await childLabels.allInnerTexts()).sort()
			assert.deepEqual(childTexts, ['Cat', 'Dog'])

			// Linked entries: Whiskers (Cat) and Generic Mammal thing (direct), Dog's
			// entry (Rex) is included too since Dog is a descendant of Mammal. Now a
			// ScoreTable (Global score/Score columns) instead of a plain list.
			const entryLabels = page.locator('.tag-page .score-table .entryCol .entryLabel')
			await entryLabels.first().waitFor({state: 'visible', timeout: 5000})
			const entryTexts = (await entryLabels.allInnerTexts()).sort()
			assert.deepEqual(entryTexts, ['Generic Mammal thing', 'Rex', 'Whiskers'])
		})

	test('renaming the current tag updates the title', async () => {
		await page.locator('.tag-page button:has-text("Rename")').click()
		await page.locator('.modal-input').fill('Big Mammal')
		await page.locator('.modal-actions button[type=submit]').click()
		await page.locator('.tag-page h1', {hasText: 'Big Mammal'}).waitFor({state: 'visible', timeout: 5000})
	})

	test('a tag already descendant of the current one is not offered as a new parent (would create a cycle)', async () => {
		await page.locator('.tag-parent-picker input[type=text]').click()
		await page.locator('.tag-parent-picker input[type=text]').fill('Cat')

		await page.waitForTimeout(1200) // let the debounced request settle
		const option = page.getByRole('option', {name: 'Cat', exact: true})
		assert.equal(await option.count(), 0)
	})

	test('adding a new valid parent link updates the parents tree', async () => {
		// already a parent: pick a fresh one instead
		await page.locator('.tag-parent-picker input[type=text]').fill('Living being')
		await page.locator('.tag-parent-picker input[type=text]').fill('')
		await page.locator('.tag-parent-picker input[type=text]').fill('Vertebrate')
		const newOption = page.getByRole('option', {name: '(New) Vertebrate'})
		await newOption.waitFor({state: 'visible', timeout: 3000})
		await newOption.click()

		await page.locator('.tag-parent-picker button').click()
		await page.locator('.tag-tree', {hasText: 'Parents'}).locator('a.tagLabel', {hasText: 'Vertebrate'})
			.waitFor({state: 'visible', timeout: 5000})
	})

	test('removing a direct parent link removes it from the tree and from the parent tag\'s linked entries', async () => {
		const animalParentRow = page.locator('.tag-tree', {hasText: 'Parents'}).locator('li', {hasText: 'Animal'}).first()
		await animalParentRow.locator('button').click()
		await page.locator('.tag-tree', {hasText: 'Parents'}).locator('a.tagLabel', {hasText: 'Animal'})
			.waitFor({state: 'hidden', timeout: 5000})

		await page.goto(BASE_URL + '/')
		await page.locator('.user-menu-trigger').waitFor({state: 'visible', timeout: 5000})
	})

	test('final sanity check: no NaN score anywhere in the entries panel after all edits', async () => {
		const scoreCells = page.locator('.entries-panel .score-table .scoreValue')
		await scoreCells.first().waitFor({state: 'visible', timeout: 5000})
		const texts = await scoreCells.allInnerTexts()
		for(const text of texts) assert.doesNotMatch(text, /NaN/)
	})
})
