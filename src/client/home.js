
function init() {
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

	$.post('login', {login, pwd}, (r)=>{
		console.log(r)
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

	$.post('login', {login, pwd, new:true}, (r)=>{
		console.log(r)
	})
}
