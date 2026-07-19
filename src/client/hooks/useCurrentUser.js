import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { apiGet } from './useApi.js'

/**
 * Fetches the current user's data (username + entry scores) once `enabled`
 * becomes true. Centralized here so both Header (username) and MainPage
 * (userScores) can share a single fetch instead of duplicating it.
 */
function useCurrentUser() {
	const auth = useAuth()

	const [username, setUsername] = useState(null)
	const [userScores, setUserScores] = useState([])
	const [userVotes, setUserVotes] = useState([])

	async function _refreshUserData () {
		if(!auth.isAuthenticated) {
			setUsername(null)
			setUserScores([])
			setUserVotes([])
			return
		}
		await apiGet('/user/me').then((data) => {
			setUsername(data.username)
			setUserScores(data.user_scores || [])
			setUserVotes(data.votes || [])
		})
	}

	const refreshUserData = useCallback(() => _refreshUserData(), [])

	useEffect(() => _refreshUserData(), [])

	return {username, userScores, refreshUserData, setUserScores, userVotes}
}

export { useCurrentUser }
