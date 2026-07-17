import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { unlinkSync, existsSync } from 'fs'
import { Manager } from '../../../src/server/data/db.js'
import { AccountManager } from '../../../src/server/data/accounts.js'

const TEST_DB_PATH = 'test/tmp/accounts.test.json'

describe('AccountManager', () => {
	let db

	beforeEach(() => {
		db = new Manager({})
	})
	afterEach((t) => {
		// Only clean up on success: keep the file around after a failure, for inspection.
		if(t.passed && existsSync(TEST_DB_PATH)) unlinkSync(TEST_DB_PATH)
	})

	test('add() creates an account with a valid login', () => {
		const accounts = new AccountManager(db)
		assert.equal(accounts.add('bobby', 'hashedpwd'), true)
	})

	test('add() refuses an already taken login', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.add('bobby', 'otherpwd'), false)
	})

	test('add() refuses a login that is too short or invalid', () => {
		const accounts = new AccountManager(db)
		assert.equal(accounts.add('ab', 'hashedpwd'), false)
		assert.equal(accounts.add('invalid login', 'hashedpwd'), false)
	})

	test('add() refuses a missing login or password', () => {
		const accounts = new AccountManager(db)
		assert.equal(accounts.add('', 'hashedpwd'), false)
		assert.equal(accounts.add('bobby', ''), false)
	})

	test('login() returns a token when the password is correct', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token = accounts.login('bobby', 'hashedpwd')
		assert.ok(token)
		assert.equal(typeof token, 'string')
	})

	test('login() fails with a wrong password', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.login('bobby', 'wrongpwd'), false)
	})

	test('login() fails when the account does not exist', () => {
		const accounts = new AccountManager(db)
		assert.equal(accounts.login('ghost', 'hashedpwd'), false)
	})

	test('two accounts have distinct salts, even with the same password', () => {
		const accounts = new AccountManager(db)
		accounts.add('alice1', 'samepwd')
		accounts.add('bobby1', 'samepwd')
		assert.notEqual(accounts.accounts.alice1.salt, accounts.accounts.bobby1.salt)
		assert.notEqual(accounts.accounts.alice1.hash, accounts.accounts.bobby1.hash)
	})

	test('save() pushes to the shared db object, then a new manager on the same db can log in', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		accounts.save()

		const reloaded = new AccountManager(db)
		assert.ok(reloaded.login('bobby', 'hashedpwd'))
	})

	test('without save(), the account is not pushed to the shared db object', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')

		const reloaded = new AccountManager(db)
		assert.equal(reloaded.login('bobby', 'hashedpwd'), false)
	})

	test('db.save() then db.load() on disk round-trips the account, including the salt', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		accounts.save()
		db.save(TEST_DB_PATH)

		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)
		const reloadedAccounts = new AccountManager(reloadedDb)
		assert.ok(reloadedAccounts.login('bobby', 'hashedpwd'))
	})

	test('check_token() validates a freshly created token', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token = accounts.login('bobby', 'hashedpwd')
		assert.equal(accounts.check_token(token), 'bobby')
	})

	test('check_token() rejects an unknown token', () => {
		const accounts = new AccountManager(db)
		assert.equal(accounts.check_token('unknown-token'), false)
	})

	test('check_token() rejects an expired token and cleans up tokens_reverse', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token = accounts.login('bobby', 'hashedpwd')

		// Force expiration by artificially moving the token's time back
		accounts.tokens_reverse.bobby.time = Date.now() - 17 * 60 * 60 * 1000

		assert.equal(accounts.check_token(token), false)
		assert.equal(accounts.tokens[token], undefined)
		assert.equal(accounts.tokens_reverse.bobby, undefined)
	})

	test('refresh_token() does not regenerate a token that is still recent', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token1 = accounts.login('bobby', 'hashedpwd')
		const token2 = accounts.refresh_token('bobby')
		assert.equal(token1, token2)
	})

	test('refresh_token() regenerates an old token and invalidates the previous one', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token1 = accounts.login('bobby', 'hashedpwd')

		// Force the refresh by moving the token's time back past the refresh rate
		accounts.tokens_reverse.bobby.time = Date.now() - 2 * 60 * 60 * 1000

		const token2 = accounts.refresh_token('bobby')
		assert.notEqual(token1, token2)
		assert.equal(accounts.tokens[token1], undefined)
		assert.equal(accounts.check_token(token2), 'bobby')
	})
})
