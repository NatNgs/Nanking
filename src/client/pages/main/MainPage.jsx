import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router'
import NewEntryForm from '../../components/quiz/NewEntryForm.jsx'
import DualQuiz from '../../components/quiz/DualQuiz.jsx'
import './MainPage.css'
import GlobalScoresPanel from '../../components/globalScoresPanel/GlobalScoresPanel.jsx'
import EntriesPanel from '../../components/entries/EntriesPanel.jsx'
import { useUserContext } from '../../context/UserContext.jsx'

function MainPage() {
	const {scoreFormatter} = useOutletContext()
	const {isAuthenticated, username, scoredEntriesCount} = useUserContext()

	const [activeView, setActiveView] = useState(null) // 'newEntry' | 'quiz' | null
	const [isPanelOpen, setIsPanelOpen] = useState(isAuthenticated)

	// isAuthenticated can flip to true after this component's first render
	// (e.g. logging in from the home page instead of arriving already logged
	// in) - open the panel on that transition instead of leaving it stuck
	// closed from the initial useState() snapshot.
	useEffect(() => {
		if(isAuthenticated) setIsPanelOpen(true)
	}, [isAuthenticated])

	function setView(name) {
		setActiveView(name)
	}

	return (
		<div className="main-page">
			{username && (
				<div className="main-page-view-buttons">
					<button onClick={() => setView(null)}>Global scores</button>
					<button onClick={() => setView('newEntry')}>New entry</button>
					{scoredEntriesCount > 2 && (<button onClick={() => setView('quiz')}>Random Quiz</button>)}
				</div>
			)}
			<div className={'main-page-view-content ' + (isPanelOpen ? 'panel-open ' : 'panel-closed ')}>
				{activeView === null && (
					<GlobalScoresPanel scoreFormatter={scoreFormatter}/>
				)}
				{activeView === 'newEntry' && (
					<NewEntryForm scoreFormatter={scoreFormatter}/>
				)}
				{activeView === 'quiz' && (
					<DualQuiz />
				)}
			</div>
			{isAuthenticated && (
				// No panel if viewport is less than 1000px wide
				<EntriesPanel
					scoreFormatter={scoreFormatter}
					isOpen={isPanelOpen}
					onToggle={() => setIsPanelOpen((v) => !v)}
				/>
			)}
		</div>
	)
}

export default MainPage
