import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { Jimp } from 'jimp'
import { startServer, stopServer, BASE_URL } from './helpers/testServer.js'

/**
 * Builds a minimal in-memory PNG buffer, usable with page.setInputFiles()
 * without ever touching disk.
 */
async function makePngBuffer(width, height, color) {
	const image = new Jimp({width, height, color})
	return image.getBuffer('image/png')
}

const LOGIN = 'quizIntegration'
const PASSWORD = 'testtest'

describe('Quiz integration flow', {concurrency: false}, () => {
	let serverProc, browser, page

	before(async () => {
		serverProc = await startServer()
		browser = await chromium.launch()
		// Wider than the 1000px breakpoint so the EntriesPanel sidebar renders (desktop-only).
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

	/**
	 * Fills the async-creatable entry name select and picks the "(New) <name>"
	 * option, then sets the score field. Does not submit.
	 */
	async function fillNewEntryForm(name, score) {
		await page.locator('.new-entry-form input[type=text]').click()
		await page.locator('.new-entry-form input[type=text]').fill(name)
		const newOption = page.getByRole('option', {name: `(New) ${name}`})
		await newOption.waitFor({state: 'visible', timeout: 3000})
		await newOption.click()

		const scoreInput = page.locator('.new-entry-form input[type=number]')
		await scoreInput.fill(String(score))
	}

	async function createEntry(name, score) {
		await page.locator('.main-page-view-buttons button:has-text("New entry")').click()
		await fillNewEntryForm(name, score)
		await page.locator('.new-entry-form button:has-text("Confirm")').click()
		// Wait for the form to accept the next entry (name field cleared) as a submit signal
		await page.locator('.new-entry-form input[type=text]').waitFor({state: 'visible', timeout: 5000})
	}

	async function scoreCellValue(row, column) {
		const text = await row.locator(`td:nth-child(${column}) .scoreValue`).innerText()
		return text.trim()
	}

	// The entries score table (columns: Score/Global) lives in the EntriesPanel
	// sidebar shown on the home page (desktop only), not on /user/me.
	function entriesPanelRow(label) {
		return page.locator('.entries-panel .score-table tbody tr', {has: page.locator(`td:has-text("${label}")`)})
	}

	/**
	 * A row of the "recent inputs" mini-table (RecentVotesTable, no rank column
	 * here) matching `detailText` (the vote's normalized .voteDetail text - the
	 * entities/value it records, NEVER a row index/position: rows shift up as
	 * older entries fall out of the last-5 window or get deleted, so asserting
	 * on position would be a false signal). `scope` narrows to the mini-table
	 * under New Entry or under Random Quiz (both render a .recent-votes-table).
	 */
	function recentVoteRow(scope, detailText) {
		return page.locator(`${scope} .recent-votes-table tbody tr`, {
			has: page.locator('.voteDetail', {hasText: detailText}),
		})
	}

	test('register and log in', async () => {
		await registerAndLogIn()
	})

	test('create "First entry" at 0% on the quiz page', async () => {
		await createEntry('First entry', 0)
	})

	test('the New Entry recent-inputs table shows the "default" vote just recorded', async () => {
		const row = recentVoteRow('.new-entry-form', 'First entry')
		await row.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await row.locator('td').nth(0).innerText(), 'default')
		assert.equal((await row.locator('.voteDetail').innerText()).replace(/\s+/g, ' ').trim(), 'First entry => 0%')
	})

	test('clicking the "x" on a default vote in the recent-inputs table removes it from both the vote history AND the personal score list', async () => {
		// Regression test: DELETE /api/quiz/default used to report success and
		// correctly drop the vote from the user's quiz history, but never
		// cleared the now-stale computed score in user.entries (only entries
		// still referenced by a live quiz get refreshed by computeUserScores),
		// so the entry kept showing up everywhere a personal score is listed.
		// Uses its own throwaway entry so the "First entry" used by the format
		// tests right after this one stays untouched.
		await createEntry('Deletable entry', 42)

		const row = recentVoteRow('.new-entry-form', 'Deletable entry')
		await row.waitFor({state: 'visible', timeout: 5000})
		await row.locator('.deleteButton').click()
		await row.waitFor({state: 'hidden', timeout: 5000})

		// Gone from the vote history mini-table (proves removeQuiz itself works)
		assert.equal(await recentVoteRow('.new-entry-form', 'Deletable entry').count(), 0)

		// Gone from the EntriesPanel personal score list too (the actual bug:
		// this used to still show "Deletable entry" with its old, now-orphaned score)
		await entriesPanelRow('Deletable entry').waitFor({state: 'hidden', timeout: 5000})
	})

	test('switch score format to MAL', async () => {
		await page.locator('select[name=format]').selectOption('MAL')
	})

	test('create "Second entry" at 10/10 on the quiz page', async () => {
		await createEntry('Second entry', 10)
	})

	test('entries panel shows both entries at 1/10 and 10/10', async () => {
		// Wait until the second entry appears in the table, then test
		const secondRow = entriesPanelRow('Second entry')
		await secondRow.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await scoreCellValue(secondRow, 2), '10/10')

		const firstRow = entriesPanelRow('First entry')
		await firstRow.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await scoreCellValue(firstRow, 2), '1/10')
	})

	test('switching back to Percent immediately shows 0% and 100%, without reloading the page', async () => {
		// Still on the home page from the previous test: switching format must
		// update the table in place, with no navigation/reload involved.
		await page.locator('select[name=format]').selectOption('Percent')

		const secondRow = entriesPanelRow('Second entry')
		assert.equal(await scoreCellValue(secondRow, 2), '100%')

		const firstRow = entriesPanelRow('First entry')
		await firstRow.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await scoreCellValue(firstRow, 2), '0%')
	})

	test('creating a third entry makes the Random Quiz (Dual) mode appear', async () => {
		await page.locator('.app-header-title').click()
		await createEntry('Third entry', 50)
		await page.locator('.main-page-view-buttons button:has-text("Random Quiz")').waitFor({state: 'visible', timeout: 5000})
	})

	/**
	 * Reads the current pair's labels (the pairing is randomized, so this must
	 * happen right before voting), clicks the given vote button, waits for the
	 * next pair to be picked (voting re-enabled) as the submit signal, then
	 * asserts a row matching the vote's CONTENT (entities + operator) appears in
	 * the Random Quiz page's own "recent inputs" mini-table - never by position,
	 * since a repeated pair replaces (not appends) an existing vote, and the
	 * mini-table only ever keeps the last 5 anyway.
	 */
	async function voteAndCheck(buttonText, expectedOp) {
		await page.locator('.dual-quiz-pair-table').waitFor({state: 'visible', timeout: 5000})
		const leftLabel = await page.locator('.dual-quiz-left .entryLabel').innerText()
		const rightLabel = await page.locator('.dual-quiz-right .entryLabel').innerText()

		await page.locator(`.dual-quiz-bt3:has-text("${buttonText}")`).click()
		await page.locator(`.dual-quiz-bt3:has-text("${buttonText}")`).waitFor({state: 'visible', timeout: 5000})

		const voteText = `${leftLabel} ${expectedOp} ${rightLabel}`
		const row = recentVoteRow('.dual-quiz', voteText)
		await row.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await row.locator('td').nth(0).innerText(), 'dual')
		assert.equal((await row.locator('.voteDetail').innerText()).replace(/\s+/g, ' ').trim(), voteText)
	}

	test('opening Dual mode and voting "<" (right preferred) records the vote', async () => {
		await page.locator('.main-page-view-buttons button:has-text("Random Quiz")').click()
		await voteAndCheck('Choose ^', '<')
	})

	test('Dual mode: voting "No Best" (tie) records an equal vote', async () => {
		await voteAndCheck('No Best', '=')
	})

	test('Dual mode: voting "^ Choose" (left preferred) records the vote', async () => {
		await voteAndCheck('^ Choose', '>')
	})

	test('create "Temporary test element" at 69% on the quiz page', async () => {
		await page.locator('.app-header-title').click()
		await createEntry('Temporary test element', 69)
	})

	test('clicking the entry name in the EntriesPanel sidebar navigates to its entry page', async () => {
		const row = entriesPanelRow('Temporary test element')
		await row.waitFor({state: 'visible', timeout: 5000})
		await row.locator('.entryLabel').click()
		await page.waitForURL(/\/entry\/.+/)
	})

	test('entry page shows the correct name, and the image redirects to the unknown placeholder', async () => {
		await page.locator('.entry-page h1', {hasText: 'Temporary test element'}).waitFor({state: 'visible', timeout: 5000})

		const img = page.locator('.entry-page-image')
		const src = await img.getAttribute('src')
		const response = await page.request.get(new URL(src, BASE_URL).toString())
		assert.equal(new URL(response.url()).pathname, '/assets/unknown.svg')
	})

	test('changing the name and picture updates the page: new name shown, image no longer redirects to the placeholder', async () => {
		await page.locator('button:has-text("Rename")').click()
		await page.locator('.modal-input').fill('Renamed test element')
		await page.locator('.modal-actions button[type=submit]').click()
		await page.locator('.entry-page h1', {hasText: 'Renamed test element'}).waitFor({state: 'visible', timeout: 5000})

		const pngBuffer = await makePngBuffer(10, 10, 0xff0000ff)
		await page.locator('#entry-page-image-uploader').setInputFiles({
			name: 'test-image.png',
			mimeType: 'image/png',
			buffer: pngBuffer,
		})
		// Wait for the upload to complete (button re-enabled) as the submit signal
		await page.locator('button:has-text("Rename")').waitFor({state: 'attached', timeout: 5000})
		await page.locator('button:has-text("Rename"):not([disabled])').waitFor({state: 'visible', timeout: 5000})

		const img = page.locator('.entry-page-image')
		const src = await img.getAttribute('src')
		const response = await page.request.get(new URL(src, BASE_URL).toString())
		assert.equal(new URL(response.url()).pathname, src.split('?')[0])
		assert.equal(response.status(), 200)
	})

	test('removing the vote deletes the entry: it disappears from the rankings, from the recent inputs, and its page no longer shows edit controls', async () => {
		const entryUrl = page.url()

		await page.locator('button:has-text("Remove it from my scores")').click()
		await page.locator('.modal-actions button', {hasText: 'OK'}).click()
		// The action navigates back to the home page once done
		await page.waitForURL(BASE_URL + '/')

		await entriesPanelRow('Renamed test element').waitFor({state: 'hidden', timeout: 5000})

		await page.locator('.main-page-view-buttons button:has-text("New entry")').click()
		const remainingRows = page.locator('.new-entry-form .recent-votes-table tbody tr', {hasText: 'Renamed test element'})
		assert.equal(await remainingRows.count(), 0)

		await page.goto(entryUrl)
		await page.locator('.error-page', {hasText: 'Entry not found'}).waitFor({state: 'visible', timeout: 5000})
		assert.equal(await page.locator('button:has-text("Rename")').count(), 0)
		assert.equal(await page.locator('button:has-text("Remove it from my scores")').count(), 0)
		assert.equal(await page.locator('#entry-page-image-uploader').count(), 0)
	})
})
