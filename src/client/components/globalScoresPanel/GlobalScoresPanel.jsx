import { useState, useEffect } from 'react'
import { apiGet } from '../../hooks/useApi.js'
import ScoreTable from '../scoreTable/ScoreTable.jsx'

const COLUMNS = [{column: 'Global score', score: (e) => e.score, sortOrder: 1}]

function GlobalScoresPanel({scoreFormatter}) {
	const [globalScores, setGlobalScores] = useState([])

	useEffect(() => {
		apiGet('/entries').then((data) => setGlobalScores(data || []))
	}, [])

	return <ScoreTable entries={globalScores} columns={COLUMNS} scoreFormatter={scoreFormatter}/>
}

export default GlobalScoresPanel
