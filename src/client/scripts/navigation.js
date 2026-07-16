
function goToPage(path) {
	if(path.includes('/')) throw new Error(`Invalid page name: ${path}`)

	console.log('########## GO TO PAGE', path)
	// Call the service url with proper headers (and token), then modify the <body> to the output got
	$.ajax({
		url: `parts/${path}/${path}.htm`,
		type: 'GET',
		headers: {'Authorization': window.localStorage.getItem('token')},
		success: (r, status, xhr)=>{
			// Find token (response header 'authorization' key)
			const token = xhr.getResponseHeader('authorization')
			if(token) window.localStorage.setItem('token', token)

			$('body').html(r)
		},
	}).fail((e, r) => {
		// remove token from storage
		window.localStorage.removeItem('token')
		window.location.reload()
		console.debug({e, r})
	})
}

let _APIcallback = null
function setAPICallback(callback) {
	_APIcallback = callback
}
function callAPI(path, method, data, callback) {
	const req = {
		url: path,
		type: method,
		headers: {'Authorization': window.localStorage.getItem('token')},
		data: data,
		cache: false,
	}
	if(method !== 'GET') {
		req.data = JSON.stringify(data)
		req.contentType = 'application/json'
	}

	req.success = (r, status, xhr)=>{
		// Find token (response header 'authorization' key)
		const token = xhr.getResponseHeader('authorization')
		if(token) window.localStorage.setItem('token', token)

		// Callback
		if(callback) return callback(r)
		if(_APIcallback) return _APIcallback(r)
	}

	$.ajax(req).fail((e, r) => {
		if(callback) callback(null, {e, r})
	})
}
function APIget(path, callback) {
	return callAPI(path, 'GET', null, callback)
}
function APIpost(path, data, callback) {
	return callAPI(path, 'POST', data, callback)
}
function APIput(path, data, callback) {
	return callAPI(path, 'PUT', data, callback)
}
