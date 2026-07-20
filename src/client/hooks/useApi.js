let unauthorizedHandler = null

/**
 * Registers the function called instead of the alert+reload fallback when a
 * request comes back 401 (expired/invalid token). Meant to be called once by
 * UserProvider on mount, so an expired session degrades to the app's normal
 * logged-out state instead of a full page reload that would wipe any
 * in-progress form/modal/vote state.
 */
function setUnauthorizedHandler(fn) {
	unauthorizedHandler = fn
}

/**
 * Sends an authenticated request to the API. Attaches the token from localStorage
 * in the `Authorization` header, and persists back the refreshed token returned by
 * the server (sliding session), mirroring the behavior of the previous callAPI().
 *
 * `data` may be a FormData instance (e.g. file uploads): it is then sent as-is
 * (multipart), without JSON.stringify or a manual Content-Type header, since the
 * browser must set its own multipart boundary.
 *
 * `options.signal` (optional) is forwarded to fetch() for request cancellation,
 * e.g. from a react-router loader's `request.signal`.
 */
async function apiFetch(path, method, data, options = {}) {
	let url = '/api' + path
	const headers = {}
	const token = window.localStorage.getItem('token')
	if(token) headers['Authorization'] = token

	const fetchOptions = {method, headers, signal: options.signal}
	if(method === 'GET') {
		if(data) url += '?' + new URLSearchParams(data).toString()
	} else if(data instanceof FormData) {
		fetchOptions.body = data
	} else {
		headers['Content-Type'] = 'application/json'
		fetchOptions.body = JSON.stringify(data)
	}

	const response = await fetch(url, fetchOptions)

	const refreshedToken = response.headers.get('authorization')
	if(refreshedToken) window.localStorage.setItem('token', refreshedToken)

	// if no refreshedToken and status is 401, means the token is expired, remove it
	if(!refreshedToken && response.status === 401) {
		window.localStorage.removeItem('token')
		if(unauthorizedHandler) {
			unauthorizedHandler()
		} else {
			// Fallback if no handler was registered yet (e.g. UserProvider not mounted)
			alert('Session token expired. Please log in again.')
			window.location.reload()
		}
		return null
	}

	if(!response.ok) {
		const contentType = response.headers.get('content-type') || ''
		const body = contentType.includes('application/json') ? await response.json() : await response.text()
		const error = new Error(typeof body === 'string' ? body : (body.message || 'API request failed: ' + url))
		error.status = response.status
		error.response = response
		throw error
	}

	const contentType = response.headers.get('content-type') || ''
	return contentType.includes('application/json') ? response.json() : response.text()
}

function apiGet(path, data, options) {
	return apiFetch(path, 'GET', data, options)
}
function apiPost(path, data, options) {
	return apiFetch(path, 'POST', data, options)
}
function apiPut(path, data, options) {
	return apiFetch(path, 'PUT', data, options)
}
function apiPatch(path, data, options) {
	return apiFetch(path, 'PATCH', data, options)
}
function apiDelete(path, data, options) {
	return apiFetch(path, 'DELETE', data, options)
}

export { apiGet, apiPost, apiPut, apiPatch, apiDelete, setUnauthorizedHandler }
