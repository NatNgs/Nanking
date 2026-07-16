
function init() {
	// If a token is found in localStorage, redirect automatically
	if(window.localStorage.getItem('token')) {
		// Call post /login with empty payload and token
		APIpost('login', {}, (onSuccess, onError)=>{
			if(onError) {
				console.warn('Login failed', onError)
				window.localStorage.removeItem('token')
			}
			if(onSuccess) goToPage('main')
		})
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

	const login = div_log.val().trim()
	const pwd = new jsSHA('SHA-512', 'TEXT', login.toLowerCase())
		.update(div_pwd.val())
		.update('Nanking')
		.getHash('B64')

	$.post('login', {login, pwd}, (r, status, xhr)=>{
		console.warn('Login success', r)
		// Find token (response header 'authorization' key)
		const token = xhr.getResponseHeader('authorization')
		if(!token) return
		window.localStorage.setItem('token', token)
		goToPage('main')
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
		goToPage('main')
	}).fail((e, r) => {
		console.warn('Login failed', r)
	})
}

function logOut() {
	window.localStorage.removeItem('token')
	window.location.reload()
}

