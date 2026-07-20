import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startServer, stopServer, BASE_URL } from './helpers/testServer.js'

const LOGIN = 'quizIntegration'
const PASSWORD = 'testtest'

describe('Quiz integration flow', {concurrency: false}, () => {
	let serverProc, browser, page

	before(async () => {
		serverProc = await startServer()
		browser = await chromium.launch()
		page = await browser.newPage()
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
		await page.locator('.app-header-username').waitFor({state: 'visible', timeout: 5000})
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

	// The score cell renders "<pretty> <colored dot>" (e.g. "1 ●" or "0% ●"):
	// only the leading token before the space is the formatted score value.
	async function scoreCellText(row, column) {
		const text = await row.locator(`td:nth-child(${column})`).innerText()
		return text.split(' ')[0]
	}

	function accountRow(label) {
		return page.locator('.score-table tbody tr', {has: page.locator(`td:has-text("${label}")`)})
	}

	test('register and log in', async () => {
		await registerAndLogIn()
	})

	test('create "First entry" at 0% on the quiz page', async () => {
		await createEntry('First entry', 0)
	})

	test('switch score format to MAL', async () => {
		await page.locator('select[name=format]').selectOption('MAL')
	})

	test('create "Second entry" at 10/10 on the quiz page', async () => {
		await createEntry('Second entry', 10)
	})

	test('account page shows both entries at 1/10 and 10/10', async () => {
		await page.locator('.app-header-username').click()

		const firstRow = accountRow('First entry')
		await firstRow.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await scoreCellText(firstRow, 2), '1')

		const secondRow = accountRow('Second entry')
		await secondRow.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await scoreCellText(secondRow, 2), '10')
	})

	test('switching back to Percent immediately shows 0% and 100%, without reloading the page', async () => {
		// Still on /user/me from the previous test: switching format must update
		// the table in place, with no navigation/reload involved.
		await page.locator('select[name=format]').selectOption('Percent')

		const firstRow = accountRow('First entry')
		await firstRow.waitFor({state: 'visible', timeout: 5000})
		assert.equal(await scoreCellText(firstRow, 2), '0%')

		const secondRow = accountRow('Second entry')
		assert.equal(await scoreCellText(secondRow, 2), '100%')
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
	 * asserts the LAST vote line on /user/me matches. Earlier lines are not
	 * checked: a repeated pair could have replaced one instead of adding it.
	 */
	async function voteAndCheck(buttonText, expectedOp) {
		await page.locator('.dual-quiz table').waitFor({state: 'visible', timeout: 5000})
		const leftLabel = await page.locator('.dual-quiz-left div').innerText()
		const rightLabel = await page.locator('.dual-quiz-right div').innerText()

		await page.locator(`.dual-quiz-bt3:has-text("${buttonText}")`).click()
		await page.locator(`.dual-quiz-bt3:has-text("${buttonText}")`).waitFor({state: 'visible', timeout: 5000})

		await page.locator('.app-header-username').click()
		const voteText = `dual: ${leftLabel} ${expectedOp} ${rightLabel}`
		await page.locator('.account-page li', {hasText: voteText}).last().waitFor({state: 'visible', timeout: 5000})
		const lastVoteText = (await page.locator('.account-page li').last().innerText()).trim()
		assert.equal(lastVoteText, voteText)

		// Back to the Dual quiz for the next vote in this scenario
		await page.locator('.app-header-title').click()
		await page.locator('.main-page-view-buttons button:has-text("Random Quiz")').click()
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
})
