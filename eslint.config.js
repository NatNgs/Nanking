import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

const SHARED_RULES = {
	/* https://eslint.org/docs/rules/ */
	'arrow-parens': ['warn', 'always'],
	'arrow-spacing': ['warn', {after: true, before: true}],
	'eol-last': ['error', 'always'],
	'indent': ['warn', 'tab', {SwitchCase: 1}],
	// catch is deliberately NOT overridden here (unlike if/for/while/switch):
	// it's the only one of these that can appear either with a parenthesized
	// binding (catch(err)) or without one (catch {}), and keyword-spacing has
	// no way to space one but not the other for the same keyword - so catch
	// keeps the default "always space after" behavior, giving catch (err) {
	// and catch { consistently, instead of clashing with a bare catch {}.
	'keyword-spacing': ['warn', {
		overrides: {
			if: {after: false},
			for: {after: false},
			while: {after: false},
			switch: {after: false},
		},
	}],
	'linebreak-style': ['error', 'unix'],
	'max-len': ['warn', {code: 127}],
	'no-empty': ['warn', {allowEmptyCatch: true}],
	'no-trailing-spaces': ['warn'],
	'no-unused-vars': ['warn', {args: 'none', vars: 'local'}],
	'no-var': ['error'],
	'prefer-const': ['error', {
		destructuring: 'all',
		ignoreReadBeforeAssign: true,
	}],
	// avoidEscape: allows "..." specifically when the string contains a '
	// (e.g. a SQL fragment like "... WHERE x = 'y'"), so it doesn't have to be
	// escaped inside single quotes - single quotes otherwise, everywhere else.
	'quotes': ['warn', 'single', {avoidEscape: true}],
	'semi': ['warn', 'never'],
	'space-in-parens': ['error', 'never'],
	'spaced-comment': ['error', 'always'],
}

export default [
	{ignores: ['dist/']},
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: globals.node,
		},
		rules: SHARED_RULES,
	},
	{
		files: ['src/client/**/*.js', 'src/client/**/*.jsx'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: globals.browser,
			parserOptions: {ecmaFeatures: {jsx: true}},
		},
		plugins: {'react-hooks': reactHooks},
		rules: {
			...SHARED_RULES,
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'warn',
		},
	},
	{
		// This file pads its default-value expressions with spaces to line up
		// the closing parentheses in a column (e.g. CONFIG's PORT/CERT_KEY_PATH/...
		// block) - space-in-parens would fight that intentional alignment.
		files: ['src/server/config/config.js'],
		rules: {
			'space-in-parens': 'off',
		},
	},
	{
		// Integration tests run in Node, but also pass callbacks into
		// page.evaluate() that execute inside the browser page instead (e.g.
		// document.querySelectorAll in auth.test.js's disableNativeFormValidation) -
		// both globals sets are legitimately in scope in the same file.
		files: ['test/integration/**/*.js'],
		languageOptions: {
			globals: {...globals.node, ...globals.browser},
		},
	},
]
