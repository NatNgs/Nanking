/**
 * Sends an authenticated request to the API. Attaches the token from localStorage
 * in the `Authorization` header, and persists back the refreshed token returned by
 * the server (sliding session), mirroring the behavior of the previous callAPI().
 */
async function apiFetch(path, method, data) {
	let url = '/api' + path
	const headers = {}
	const token = window.localStorage.getItem('token')
	if(token) headers['Authorization'] = token

	const options = {method, headers}
	if(method === 'GET') {
		if(data) url += '?' + new URLSearchParams(data).toString()
	} else {
		headers['Content-Type'] = 'application/json'
		options.body = JSON.stringify(data)
	}

	const response = await fetch(url, options)

	const refreshedToken = response.headers.get('authorization')
	if(refreshedToken) window.localStorage.setItem('token', refreshedToken)

	if(!response.ok) {
		const error = new Error('API request failed: ' + url)
		error.status = response.status
		throw error
	}

	const contentType = response.headers.get('content-type') || ''
	return contentType.includes('application/json') ? response.json() : response.text()
}

function apiGet(path, data) {
	return apiFetch(path, 'GET', data)
}
function apiPost(path, data) {
	return apiFetch(path, 'POST', data)
}
function apiPut(path, data) {
	return apiFetch(path, 'PUT', data)
}

export { apiGet, apiPost, apiPut }
