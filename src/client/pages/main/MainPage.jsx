import { useState, useMemo } from 'react'
import { useOutletContext } from 'react-router'
import NewEntryForm from '../../components/quiz/NewEntryForm.jsx'
import DualQuiz from '../../components/quiz/DualQuiz.jsx'
import './MainPage.css'
import GlobalScoresPanel from '../../components/globalScoresPanel/GlobalScoresPanel.jsx'

function pickPair(options) {
	const i1 = Math.floor(Math.random() * options.length)
	let i2 = Math.floor(Math.random() * (options.length - 1))
	if(i2 >= i1) i2++
	return [options[i1], options[i2]]
}

function MainPage() {
	const {isAuthenticated, userScores, setUserScores, scoreFormatter} = useOutletContext()

	const [activeView, setActiveView] = useState(null) // 'newEntry' | 'quiz' | null
	const [quizPair, setQuizPair] = useState(null)
	const [quizMessage, setQuizMessage] = useState('')

	function handleShowGlobalScores() {
		setActiveView(null)
	}
	function handleShowNewEntry() {
		setActiveView('newEntry')
	}
	function handleShowQuiz() {
		if(userScores.length < 3) {
			setQuizMessage('Not enough entries')
			setQuizPair(null)
			setActiveView('quiz')
			return
		}
		setQuizMessage('')
		setQuizPair(pickPair(userScores))
		setActiveView('quiz')
	}
	function handleVoted() {
		if(userScores.length < 3) {
			setQuizMessage('Not enough entries')
			setQuizPair(null)
			return
		}
		setQuizPair(pickPair(userScores))
	}

	return (
		<div className="main-page">
			{isAuthenticated && (
				<div className="main-page-view-buttons" >
					<button onClick={handleShowGlobalScores}>Global scores</button>
					<button onClick={handleShowNewEntry}>New entry</button>
					<button onClick={handleShowQuiz}>Random Quiz</button>
				</div>
			)}
			<div className="main-page-view-content">
				{activeView === null && (
					<GlobalScoresPanel scoreFormatter={scoreFormatter}/>
				)}
				{isAuthenticated && activeView === 'newEntry' && (
					<NewEntryForm scoreFormatter={scoreFormatter} onEntryCreated={setUserScores}/>
				)}
				{isAuthenticated && activeView === 'quiz' && (
					<>
						{quizMessage}
						{quizPair && <DualQuiz left={quizPair[0]} right={quizPair[1]} onVoted={handleVoted}/>}
					</>
				)}
			</div>
		</div>
	)
}

export default MainPage
