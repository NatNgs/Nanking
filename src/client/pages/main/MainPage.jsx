import { useState, useMemo } from 'react'
import { useOutletContext } from 'react-router'
import NewEntryForm from '../../components/quiz/NewEntryForm.jsx'
import DualQuiz from '../../components/quiz/DualQuiz.jsx'
import './MainPage.css'
import GlobalScoresPanel from '../../components/globalScoresPanel/GlobalScoresPanel.jsx'
import EntriesPanel from '../../components/entries/EntriesPanel.jsx'
import { useUserContext } from '../../context/UserContext.jsx'

function MainPage() {
	const {scoreFormatter} = useOutletContext()
	const {isAuthenticated, username, userScores} = useUserContext()

	const [activeView, setActiveView] = useState(null) // 'newEntry' | 'quiz' | null
	const [isPanelOpen, setIsPanelOpen] = useState(isAuthenticated)

	function setView(name) {
		setActiveView(name)
	}

	return (
		<div className="main-page">
			{username && (
				<div className="main-page-view-buttons" >
					<button onClick={()=>setView(null)}>Global scores</button>
					<button onClick={()=>setView('newEntry')}>New entry</button>
					{ userScores.length > 2 && (<button onClick={()=>setView('quiz')}>Random Quiz</button>)}
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
