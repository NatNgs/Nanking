
function init() {
	// If a token is found in localStorage, redirect automatically
	if(window.localStorage.getItem('token')) {
		goToPage('/user')
	}

	$('#form_login')[0].addEventListener('submit', (e)=>{
		e.preventDefault()
		login()
	})
	$('#form_register')[0].addEventListener('submit', (e)=>{
		e.preventDefault()
		register()
	})
}
function login() {
	// Check if values matches <input patterns='...'> if not, return
	const div_log = $('#login')
	const div_pwd = $('#password')
	if(!div_log.val().match(div_log.attr('pattern'))) return
	if(!div_pwd.val().match(div_pwd.attr('pattern'))) return

	const login = div_log.val()
	const pwd = new jsSHA('SHA-512', 'TEXT', login)
		.update(div_pwd.val())
		.update('Nanking')
		.getHash('B64')

	$.post('login', {login, pwd}, (r, status, xhr)=>{
		console.warn('Login success', r)
		// Find token (response header 'authorization' key)
		const token = xhr.getResponseHeader('authorization')
		if(!token) return
		window.localStorage.setItem('token', token)
		goToPage('/user')
	}).fail((e, r) => {
		console.warn('Login failed', r, e)
	})
}

function register() {
	// Check if values matches <input patterns='...'> if not, return
	const div_log = $('#new_login')
	const div_pwd = $('#new_password')
	if(!div_log.val().match(div_log.attr('pattern'))) return
	if(!div_pwd.val().match(div_pwd.attr('pattern'))) return

	const login = div_log.val()
	const pwd = new jsSHA('SHA-512', 'TEXT', login)
		.update(div_pwd.val())
		.update('Nanking')
		.getHash('B64')

	$.post('login', {login, pwd, new:true}, (r, status, xhr)=>{
		// Find token (response header 'authorization' key)
		const token = xhr.getResponseHeader('authorization')
		if(!token) return
		window.localStorage.setItem('token', token)
		console.warn('Register success', r)
		goToPage('/user')
	}).fail((e, r) => {
		console.warn('Login failed', r)
	})
}

function logOut() {
	window.localStorage.removeItem('token')
	goToPage('/')
}




function goToPage(path) {
	console.log('########## GO TO PAGE', path)
	// Call the service url with proper headers (and token), then modify the <body> to the output got
	$.ajax({
		url: path,
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

