import { useEffect, useState } from 'react'
import './EntriesPanel.css'
import { useUserContext } from '../../context/UserContext.jsx'
import ScoreTable from '../scoreTable/ScoreTable.jsx'

const COLUMNS = [
	{column: 'Score', score: (e) => e.score, sortOrder: 1},
	{column: 'Global', score: (e) => e.globalScore, sortOrder: 2},
]

function EntriesPanel({scoreFormatter, isOpen, onToggle}) {
	// Only show panel when screen is wide enough (desktop mode)
	const {userScores} = useUserContext()
	const [isToBeDisplayed, setToBeDisplayed] = useState(window.innerWidth > 1000)
	const updateMedia = () => setToBeDisplayed(window.innerWidth > 1000)
	useEffect(() => window.addEventListener('resize', updateMedia), [updateMedia])

	return (
		<>
		{isToBeDisplayed && (
			<button
				type="button"
				className={'entries-panel-toggle' + (isOpen ? '' : ' entries-panel-toggle-closed')}
				onClick={onToggle}
			>
				{isOpen ? '>' : '<'}
			</button>
		)}
		{isToBeDisplayed && isOpen && (
			<aside className="entries-panel">
				<ScoreTable entries={userScores} columns={COLUMNS} scoreFormatter={scoreFormatter}/>
			</aside>
		)}
		</>
	)
}

export default EntriesPanel
