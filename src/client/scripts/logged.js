
function initPage() {
	// Call service get user data
	APIget('/user/me', 'GET', (r) => {
		$('#userId').html(r)
	})
}
