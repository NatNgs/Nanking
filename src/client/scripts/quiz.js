
const QUIZ = new (function () {
	let last = null
	this.dual = (parent_div, _left, _right) => {
		const cb = () => {
			// DUAL variable contains 2 elements to compare
			$('#dual_leftTitle')[0].innerText = _left.label
			$('#dual_rightTitle')[0].innerText = _right.label

			$('#dual_left > img')[0].src = _left.image
			$('#dual_right > img')[0].src = _right.image

			$('#dual button').attr('disabled', false)

			// Set actions on click on choose or No best
			$('#dual_bSame')[0].onclick = () => {
				$('#dual button').attr('disabled', true)
				APIpost('quiz/dual', {neg: _left.id, vote: 0, pos: _right.id}, (onSuccess, onError)=>clickNewQuiz())
			}
			$('#dual_bLeft')[0].onclick = () => {
				$('#dual button').attr('disabled', true)
				APIpost('quiz/dual', {neg: _left.id, vote: -1, pos: _right.id}, (onSuccess, onError)=>clickNewQuiz())
			}
			$('#dual_bRight')[0].onclick = () => {
				$('#dual button').attr('disabled', true)
				APIpost('quiz/dual', {neg: _left.id, vote: +1, pos: _right.id}, (onSuccess, onError)=>clickNewQuiz())
			}
			last = 'dual'
		}

		if(last === 'dual') cb()
		else parent_div.load('parts/dual/dual.htm', cb)
	}
})
