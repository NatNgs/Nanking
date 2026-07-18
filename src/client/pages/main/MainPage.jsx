import { useState, useMemo } from 'react'
import { useOutletContext } from 'react-router'
import EntriesPanel from '../../components/entries/EntriesPanel.jsx'
import NewEntryForm from '../../components/quiz/NewEntryForm.jsx'
import DualQuiz from '../../components/quiz/DualQuiz.jsx'
import './MainPage.css'

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
	const [isPanelOpen, setIsPanelOpen] = useState(true)

	if(!isAuthenticated) return null

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
			<EntriesPanel
				userScores={userScores}
				setUserScores={setUserScores}
				scoreFormatter={scoreFormatter}
				isOpen={isPanelOpen}
				onToggle={() => setIsPanelOpen((v) => !v)}
			/>
			<div className={'main-page-content ' + (isPanelOpen ? 'panel-open' : 'panel-closed')}>
				<div className="main-page-view-buttons">
					<button onClick={handleShowNewEntry}>New entry</button>
					<button onClick={handleShowQuiz}>Random Quiz</button>
				</div>
				<div className="main-page-view-content">
					{activeView === 'newEntry' && (
						<NewEntryForm scoreFormatter={scoreFormatter} onEntryCreated={setUserScores}/>
					)}
					{activeView === 'quiz' && (
						<>
							{quizMessage}
							{quizPair && <DualQuiz left={quizPair[0]} right={quizPair[1]} onVoted={handleVoted}/>}
						</>
					)}
				</div>
			</div>
		</div>
	)
}

export default MainPage
