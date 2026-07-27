import { test, describe, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { useSqliteFixture } from '../../helpers/sqliteTestSetup.js'
import {
	getAccount, addAccount, getDisplayLogin, isAdmin, login, verifyPassword, removeAccount,
} from '../../../src/server/data/accountsRepository.js'

describe('accountsRepository', () => {
	const db = useSqliteFixture()
	let sqlite
	beforeEach(() => { sqlite = db.sqlite })

	describe('addAccount', () => {
		test('creates an account with a valid login', async () => {
			assert.equal(await addAccount(sqlite, 'bobby', 'hashedpwd'), true)
		})

		test('refuses an already taken login', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.equal(await addAccount(sqlite, 'bobby', 'otherpwd'), false)
		})

		test('refuses a login that is too short or invalid', async () => {
			assert.equal(await addAccount(sqlite, 'ab', 'hashedpwd'), false)
			assert.equal(await addAccount(sqlite, 'invalid login', 'hashedpwd'), false)
		})

		test('refuses a missing login or password', async () => {
			assert.equal(await addAccount(sqlite, '', 'hashedpwd'), false)
			assert.equal(await addAccount(sqlite, 'bobby', ''), false)
		})

		test('refuses an account whose login differs only by case from an existing one', async () => {
			await addAccount(sqlite, 'Bobby', 'hashedpwd')
			assert.equal(await addAccount(sqlite, 'bobby', 'otherpwd'), false)
			assert.equal(await addAccount(sqlite, 'BOBBY', 'otherpwd'), false)
		})

		test('two accounts have distinct salts, even with the same password', async () => {
			await addAccount(sqlite, 'alice1', 'samepwd')
			await addAccount(sqlite, 'bobby1', 'samepwd')
			const alice = await getAccount(sqlite, 'alice1')
			const bobby = await getAccount(sqlite, 'bobby1')
			assert.notEqual(alice.salt, bobby.salt)
			assert.notEqual(alice.hash, bobby.hash)
		})

		test('attaches credentials to an existing ghost account (password_hash NULL)', async () => {
			await sqlite.run(
				"INSERT INTO accounts (username, display_login, password_hash, salt) VALUES ('ghosty', 'Ghosty', NULL, NULL)"
			)
			assert.equal(await addAccount(sqlite, 'ghosty', 'hashedpwd'), true)
			assert.ok(await login(sqlite, 'ghosty', 'hashedpwd'))
		})
	})

	describe('login', () => {
		test('returns the canonical username when the password is correct', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.equal(await login(sqlite, 'bobby', 'hashedpwd'), 'bobby')
		})

		test('fails with a wrong password', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.equal(await login(sqlite, 'bobby', 'wrongpwd'), false)
		})

		test('fails when the account does not exist', async () => {
			assert.equal(await login(sqlite, 'ghost', 'hashedpwd'), false)
		})

		test('succeeds regardless of the case used, once the account exists', async () => {
			await addAccount(sqlite, 'Bobby', 'hashedpwd')
			assert.ok(await login(sqlite, 'BOBBY', 'hashedpwd'))
			assert.ok(await login(sqlite, 'bobby', 'hashedpwd'))
		})

		test('fails for a ghost account with no credentials yet', async () => {
			await sqlite.run(
				"INSERT INTO accounts (username, display_login, password_hash, salt) VALUES ('ghosty', 'Ghosty', NULL, NULL)"
			)
			assert.equal(await login(sqlite, 'ghosty', 'anything'), false)
		})
	})

	describe('getDisplayLogin', () => {
		test('returns the login with the case it was created with', async () => {
			await addAccount(sqlite, 'Bobby', 'hashedpwd')
			assert.equal(await getDisplayLogin(sqlite, 'bobby'), 'Bobby')
		})

		test('falls back to the lookup key for an unknown account', async () => {
			assert.equal(await getDisplayLogin(sqlite, 'bobby'), 'bobby')
		})
	})

	describe('verifyPassword', () => {
		test('succeeds with the correct password', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.equal(await verifyPassword(sqlite, 'bobby', 'hashedpwd'), true)
		})

		test('fails with a wrong password', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.equal(await verifyPassword(sqlite, 'bobby', 'wrongpwd'), false)
		})

		test('fails when the account does not exist', async () => {
			assert.equal(await verifyPassword(sqlite, 'ghost', 'hashedpwd'), false)
		})
	})

	describe('removeAccount', () => {
		test('deletes the account and returns true', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.equal(await removeAccount(sqlite, 'bobby'), true)
			assert.equal(await getAccount(sqlite, 'bobby'), null)
			assert.equal(await login(sqlite, 'bobby', 'hashedpwd'), false)
		})

		test('returns false when the account does not exist', async () => {
			assert.equal(await removeAccount(sqlite, 'ghost'), false)
		})
	})

	describe('isAdmin', () => {
		test('is false by default (not settable from the application itself)', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			assert.equal(await isAdmin(sqlite, 'bobby'), false)
		})

		test('is false for an unknown account', async () => {
			assert.equal(await isAdmin(sqlite, 'ghost'), false)
		})

		test('reflects the Admin flag once set directly in SQLite', async () => {
			await addAccount(sqlite, 'bobby', 'hashedpwd')
			await sqlite.run("UPDATE accounts SET is_admin = 1 WHERE username = 'bobby'")
			assert.equal(await isAdmin(sqlite, 'bobby'), true)
		})
	})
})
