import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AccountManager } from '../../../src/server/data/accounts.js'

describe('AccountManager', () => {
	test('add() creates an account with a valid login', () => {
		const accounts = new AccountManager()
		assert.equal(accounts.add('bobby', 'hashedpwd'), true)
	})

	test('add() refuses an already taken login', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.add('bobby', 'otherpwd'), false)
	})

	test('add() refuses a login that is too short or invalid', () => {
		const accounts = new AccountManager()
		assert.equal(accounts.add('ab', 'hashedpwd'), false)
		assert.equal(accounts.add('invalid login', 'hashedpwd'), false)
	})

	test('add() refuses a missing login or password', () => {
		const accounts = new AccountManager()
		assert.equal(accounts.add('', 'hashedpwd'), false)
		assert.equal(accounts.add('bobby', ''), false)
	})

	test('login() returns the canonical username when the password is correct', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.login('bobby', 'hashedpwd'), 'bobby')
	})

	test('login() fails with a wrong password', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.login('bobby', 'wrongpwd'), false)
	})

	test('login() fails when the account does not exist', () => {
		const accounts = new AccountManager()
		assert.equal(accounts.login('ghost', 'hashedpwd'), false)
	})

	test('two accounts have distinct salts, even with the same password', () => {
		const accounts = new AccountManager()
		accounts.add('alice1', 'samepwd')
		accounts.add('bobby1', 'samepwd')
		assert.notEqual(accounts.accounts.alice1.salt, accounts.accounts.bobby1.salt)
		assert.notEqual(accounts.accounts.alice1.hash, accounts.accounts.bobby1.hash)
	})

	test('getDisplayLogin() returns the login with the case it was created with', () => {
		const accounts = new AccountManager()
		accounts.add('Bobby', 'hashedpwd')
		assert.equal(accounts.getDisplayLogin('bobby'), 'Bobby')
	})

	test('login() succeeds regardless of the case used, once the account exists', () => {
		const accounts = new AccountManager()
		accounts.add('Bobby', 'hashedpwd')
		assert.ok(accounts.login('BOBBY', 'hashedpwd'))
		assert.ok(accounts.login('bobby', 'hashedpwd'))
	})

	test('add() refuses an account whose login differs only by case from an existing one', () => {
		const accounts = new AccountManager()
		accounts.add('Bobby', 'hashedpwd')
		assert.equal(accounts.add('bobby', 'otherpwd'), false)
		assert.equal(accounts.add('BOBBY', 'otherpwd'), false)
	})

	test('getDisplayLogin() falls back to the lookup key for accounts stored before displayLogin existed', () => {
		const accounts = new AccountManager()
		// Simulates a legacy account persisted before this field was introduced
		accounts.accounts.bobby = {hash: 'x', salt: 'y'}
		assert.equal(accounts.getDisplayLogin('bobby'), 'bobby')
	})

	test('verifyPassword() succeeds with the correct password', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.verifyPassword('bobby', 'hashedpwd'), true)
	})

	test('verifyPassword() fails with a wrong password', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.verifyPassword('bobby', 'wrongpwd'), false)
	})

	test('verifyPassword() fails when the account does not exist', () => {
		const accounts = new AccountManager()
		assert.equal(accounts.verifyPassword('ghost', 'hashedpwd'), false)
	})

	test('remove() deletes the account and returns true', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.remove('bobby'), true)
		assert.equal(accounts.accounts.bobby, undefined)
		assert.equal(accounts.login('bobby', 'hashedpwd'), false)
	})

	test('remove() returns false when the account does not exist', () => {
		const accounts = new AccountManager()
		assert.equal(accounts.remove('ghost'), false)
	})

	test('isAdmin() is false by default (not settable from the application itself)', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		assert.equal(accounts.isAdmin('bobby'), false)
	})

	test('isAdmin() is false for an unknown account', () => {
		const accounts = new AccountManager()
		assert.equal(accounts.isAdmin('ghost'), false)
	})

	test('isAdmin() reflects the Admin flag once set directly (e.g. loaded from SQLite)', () => {
		const accounts = new AccountManager()
		accounts.add('bobby', 'hashedpwd')
		accounts.accounts.bobby.isAdmin = true
		assert.equal(accounts.isAdmin('bobby'), true)
	})
})
