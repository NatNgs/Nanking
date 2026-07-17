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
		const token = accounts.login('bobby', 'hashedpwd', '1.2.3.4')

		// Force expiration by artificially moving the token's time back
		accounts.tokens_reverse.bobby.time = Date.now() - 17 * 60 * 60 * 1000

		assert.equal(accounts.check_token(token, '1.2.3.4'), false)
		assert.equal(accounts.tokens_reverse.bobby, undefined)
	})

	test('refresh_token() returns the current token as-is when it is still recent (given by the caller)', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token1 = accounts.login('bobby', 'hashedpwd', '1.2.3.4')
		const token2 = accounts.refresh_token('bobby', '1.2.3.4', token1)
		assert.equal(token1, token2)
	})

	test('refresh_token() regenerates a token when the caller does not provide the current one', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token1 = accounts.login('bobby', 'hashedpwd', '1.2.3.4')
		const token2 = accounts.refresh_token('bobby', '1.2.3.4', null)

		assert.notEqual(token1, token2)
		assert.equal(accounts.check_token(token1, '1.2.3.4'), false)
		assert.equal(accounts.check_token(token2, '1.2.3.4'), 'bobby')
	})

	test('refresh_token() regenerates an old token and invalidates the previous one', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token1 = accounts.login('bobby', 'hashedpwd', '1.2.3.4')

		// Force the refresh by moving the token's time back past the refresh rate
		accounts.tokens_reverse.bobby.time = Date.now() - 2 * 60 * 60 * 1000

		const token2 = accounts.refresh_token('bobby', '1.2.3.4', token1)
		assert.notEqual(token1, token2)
		assert.equal(accounts.check_token(token1, '1.2.3.4'), false)
		assert.equal(accounts.check_token(token2, '1.2.3.4'), 'bobby')
	})

	test('check_token() succeeds when the IP matches the one the token was issued on', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token = accounts.login('bobby', 'hashedpwd', '1.2.3.4')
		assert.equal(accounts.check_token(token, '1.2.3.4'), 'bobby')
	})

	test('check_token() fails when the IP does not match the one the token was issued on', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token = accounts.login('bobby', 'hashedpwd', '1.2.3.4')
		assert.equal(accounts.check_token(token, '5.6.7.8'), false)
	})

	test('check_token() fails when the token was issued without an IP and is later checked with one', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token = accounts.login('bobby', 'hashedpwd')
		assert.equal(accounts.check_token(token, '1.2.3.4'), false)
	})

	test('refresh_token() issues a new token when called from a different IP, even given the previous token', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		const token1 = accounts.login('bobby', 'hashedpwd', '1.2.3.4')
		// A different IP means a different hash(token, ip): the caller could not have validated
		// token1 against '5.6.7.8' beforehand, but this checks refresh_token()'s own behavior.
		const token2 = accounts.refresh_token('bobby', '5.6.7.8', token1)

		assert.notEqual(token1, token2)
		// The previous token is invalidated, and the new one is bound to the new IP
		assert.equal(accounts.check_token(token1, '1.2.3.4'), false)
		assert.equal(accounts.check_token(token2, '5.6.7.8'), 'bobby')
	})

	test('neither the raw token nor the IP are kept in memory: tokens_reverse only holds a hash and a timestamp', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		accounts.login('bobby', 'hashedpwd', '1.2.3.4')

		const stored = accounts.tokens_reverse.bobby
		assert.deepEqual(Object.keys(stored).sort(), ['hash', 'time'])
		assert.equal(typeof stored.hash, 'string')
		assert.equal(stored.hash.includes('1.2.3.4'), false)
	})

	test('session binding is not persisted: reloading from disk does not keep it around', () => {
		const accounts = new AccountManager(db)
		accounts.add('bobby', 'hashedpwd')
		accounts.save()
		db.save(TEST_DB_PATH)

		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)
		const reloadedAccounts = new AccountManager(reloadedDb)
		assert.deepEqual(reloadedAccounts.tokens_reverse, {})
	})

	test('getDisplayLogin() returns the login with the case it was created with', () => {
		const accounts = new AccountManager(db)
		accounts.add('Bobby', 'hashedpwd')
		assert.equal(accounts.getDisplayLogin('bobby'), 'Bobby')
	})

	test('login() succeeds regardless of the case used, once the account exists', () => {
		const accounts = new AccountManager(db)
		accounts.add('Bobby', 'hashedpwd')
		assert.ok(accounts.login('BOBBY', 'hashedpwd'))
		assert.ok(accounts.login('bobby', 'hashedpwd'))
	})

	test('add() refuses an account whose login differs only by case from an existing one', () => {
		const accounts = new AccountManager(db)
		accounts.add('Bobby', 'hashedpwd')
		assert.equal(accounts.add('bobby', 'otherpwd'), false)
		assert.equal(accounts.add('BOBBY', 'otherpwd'), false)
	})

	test('getDisplayLogin() falls back to the lookup key for accounts stored before displayLogin existed', () => {
		const accounts = new AccountManager(db)
		// Simulates a legacy account persisted before this field was introduced
		accounts.accounts.bobby = {hash: 'x', salt: 'y'}
		assert.equal(accounts.getDisplayLogin('bobby'), 'bobby')
	})

	test('displayLogin survives a save()/db.save()/load() round-trip', () => {
		const accounts = new AccountManager(db)
		accounts.add('Bobby', 'hashedpwd')
		accounts.save()
		db.save(TEST_DB_PATH)

		const reloadedDb = new Manager({})
		reloadedDb.load(TEST_DB_PATH)
		const reloadedAccounts = new AccountManager(reloadedDb)
		assert.equal(reloadedAccounts.getDisplayLogin('bobby'), 'Bobby')
	})
})
