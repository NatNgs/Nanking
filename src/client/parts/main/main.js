
function initPage() {
	setAPICallback(updateDataFromResponse)

	// Call service get user data
	APIget('/user/me')

	onUpdateScoreFormat((previousFormat, newFormat) => {
		// Get current input value and format
		const value = previousFormat.toNorm($('#newEntryScore').val())

		// Format input style and limits
		$('#newEntryScore').attr('min', newFormat.min)
		$('#newEntryScore').attr('max', newFormat.max)
		$('#newEntryScore').attr('step', newFormat.step)

		// Update input value
		$('#newEntryScore').val(newFormat.toFormat(value))

		updateDataTable()
	})
	updateScoreFormat($('#scoreFormat').val())
}



function clickNewEntry() {
	const name = $('#newEntryName').val()
	const score = +($('#newEntryScore').val())

	// Check that score is a number between 1 and 10, integer
	if(score < FORMATTER.min || score > FORMATTER.max) {
		alert(`Score must be between ${FORMATTER.min} and ${FORMATTER.max}`)
		return
	}

	APIput('/user/entry', {entry: name, score:FORMATTER.toNorm(score)})
}

let _receivedData = {}
function updateDataFromResponse(response) {
	for(const key in response) _receivedData[key] = response[key]
	updateDataTable()
}
function updateDataTable() {
	if(_receivedData.username) $('#userId')[0].innerText = _receivedData.username

	if(_receivedData.user_scores) {
		// Prepare table: sort entries by computed score (then by given score) from most to least
		_receivedData.user_scores.sort((a,b) => b.cur - a.cur || b.man - a.man)

		const table = $('#userList tbody')[0]
		table.innerHTML = ''
		for(const entry of _receivedData.user_scores) {
			const div_name = document.createElement('td')
			const div_manual = document.createElement('td')
			const div_computed = document.createElement('td')
			div_name.innerText = entry.label
			div_manual.innerText = FORMATTER.pretty(entry.man)
			div_computed.innerText = FORMATTER.pretty(entry.cur)

			const row = document.createElement('tr')
			table.appendChild(row)
			row.appendChild(div_name)
			row.appendChild(div_manual)
			row.appendChild(div_computed)
		}
	}
}

function clickNewQuiz() {
	// If less than 3 entries: display "Not enough entries" in the quiz div
	const options = _receivedData?.user_scores || []
	if(options.length < 3) {
		$('#quiz')[0].innerHTML = 'Not enough entries'
		return
	}

	// Get 2 random entries
	const r1 = Math.floor(Math.random() * options.length)
	let r2 = Math.floor(Math.random() * (options.length - 1))
	if (r2 >= r1) r2++

	// Display the quiz
	QUIZ.dual($('#quiz'), options[r1], options[r2])
}
