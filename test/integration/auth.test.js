import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { startServer, stopServer, BASE_URL } from './helpers/testServer.js'

const LOGIN = 'testIntegration'
const PASSWORD = 'testtest'
const WRONG_LOGIN = 'mauvaisLogin'
const WRONG_PASSWORD_1 = '42424242'
const WRONG_PASSWORD_2 = 'mauvais mot 2 pÃ$$'
const WRONG_PASSWORD_3 = 'mauvais mot 3 pÃ$$'

// LOGIN_PATTERN=/^[a-zA-Z0-9_.\-]{4,20}$/ and PASSWORD_PATTERN=/^.{6,}$/ in
// LoginModal.jsx both accept every value used above (no whitespace/accented
// character restriction on the password field), so the browser's native HTML
// `pattern` validation never blocks these submits. `noValidate` is disabled
// anyway as a safety net, in case the scenario grows to include values that
// would otherwise fail the native check silently (no submit, no API call, no
// role="alert" message - a hard-to-diagnose false negative).

describe('Auth integration flow', {concurrency: false}, () => {
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

	async function disableNativeFormValidation() {
		await page.evaluate(() => {
			document.querySelectorAll('form').forEach((f) => { f.noValidate = true })
		})
	}

	async function assertLoggedOut() {
		await page.locator('.app-header-actions button:has-text("Login")').waitFor({state: 'visible', timeout: 3000})
		assert.equal(await page.locator('.app-header-actions button:has-text("Register")').isVisible(), true)
		assert.equal(await page.locator('.app-header-username').count(), 0)
		assert.equal(await page.locator('.app-header-actions button:has-text("Log out")').count(), 0)
	}

	async function assertLoggedInAs(username) {
		await page.locator('.app-header-username').waitFor({state: 'visible', timeout: 5000})
		assert.equal(await page.locator('.app-header-username').innerText(), username)
		assert.equal(await page.locator('.app-header-actions button:has-text("Log out")').isVisible(), true)
		assert.equal(await page.locator('.app-header-actions button:has-text("Login")').count(), 0)
		assert.equal(await page.locator('.app-header-actions button:has-text("Register")').count(), 0)
	}

	async function submitLoginModal(login, password) {
		await disableNativeFormValidation()
		await page.locator('.login-modal-box input[type=text]').fill(login)
		await page.locator('.login-modal-box input[type=password]').fill(password)
		await page.locator('.login-modal-box button[type=submit]').click()
	}

	async function assertLoginModalError(expectedText) {
		await page.locator('.login-modal-box [role=alert]').waitFor({state: 'visible', timeout: 3000})
		assert.equal(await page.locator('.login-modal-box [role=alert]').innerText(), expectedText)
	}

	test('home page shows Login/Register when logged out', async () => {
		await page.goto(BASE_URL + '/')
		await assertLoggedOut()
	})

	test('login fails twice before the account exists', async () => {
		await page.locator('.app-header-actions button:has-text("Login")').click()
		await submitLoginModal(LOGIN, PASSWORD)
		await assertLoginModalError('Login failed')

		await submitLoginModal(LOGIN, PASSWORD)
		await assertLoginModalError('Login failed')

		await page.locator('.login-modal-close').click()
		await assertLoggedOut()
	})

	test('register succeeds and logs in automatically', async () => {
		await page.locator('.app-header-actions button:has-text("Register")').click()
		await submitLoginModal(LOGIN, PASSWORD)
		await assertLoggedInAs(LOGIN)
	})

	test('log out returns to the logged-out state', async () => {
		await page.locator('.app-header-actions button:has-text("Log out")').click()
		await assertLoggedOut()
	})

	test('register fails when the account already exists, header unchanged', async () => {
		await page.locator('.app-header-actions button:has-text("Register")').click()
		await submitLoginModal(LOGIN, PASSWORD)
		await assertLoginModalError('Registration failed')
		await assertLoggedOut()
	})

	test('register fails with a different password on an existing login, header unchanged', async () => {
		await submitLoginModal(LOGIN, WRONG_PASSWORD_1)
		await assertLoginModalError('Registration failed')
		await page.locator('.login-modal-close').click()
		await assertLoggedOut()
	})

	test('login fails with a wrong login, then a wrong password, header unchanged', async () => {
		await page.locator('.app-header-actions button:has-text("Login")').click()

		await submitLoginModal(WRONG_LOGIN, PASSWORD)
		await assertLoginModalError('Login failed')

		await submitLoginModal(LOGIN, WRONG_PASSWORD_2)
		await assertLoginModalError('Login failed')

		await page.locator('.login-modal-close').click()
		await assertLoggedOut()
	})

	test('login succeeds with the correct credentials', async () => {
		await page.locator('.app-header-actions button:has-text("Login")').click()
		await submitLoginModal(LOGIN, PASSWORD)
		await assertLoggedInAs(LOGIN)
	})

	test('clicking the username navigates to the account page', async () => {
		await page.locator('.app-header-username').click()
		await page.waitForURL('**/user/me')
		await page.locator('.account-page h1').waitFor({state: 'visible'})
		assert.equal(await page.locator('.account-page h1').innerText(), LOGIN)
		assert.equal(await page.locator('.account-page button:has-text("Remove my account")').isVisible(), true)
	})

	test('account removal fails with a wrong password, still logged in', async () => {
		await page.locator('.account-page button:has-text("Remove my account")').click()
		await disableNativeFormValidation()

		await page.locator('.delete-account-modal-box input[type=password]').fill(WRONG_PASSWORD_3)
		await page.locator('.delete-account-modal-box button[type=submit]').click()
		await page.locator('.delete-account-modal-box [role=alert]').waitFor({state: 'visible', timeout: 3000})
		assert.equal(await page.locator('.delete-account-modal-box [role=alert]').innerText(), 'Wrong password')

		await assertLoggedInAs(LOGIN)
	})

	test('account removal succeeds with the correct password, back to logged-out state', async () => {
		await page.locator('.delete-account-modal-box input[type=password]').fill(PASSWORD)
		await page.locator('.delete-account-modal-box button[type=submit]').click()
		await assertLoggedOut()
	})

	test('login with the deleted account credentials fails', async () => {
		await page.locator('.app-header-actions button:has-text("Login")').click()
		await submitLoginModal(LOGIN, PASSWORD)
		await assertLoginModalError('Login failed')
		await assertLoggedOut()
	})
})
