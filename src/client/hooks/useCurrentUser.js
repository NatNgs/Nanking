import { useState, useEffect, useCallback } from 'react'
import { apiGet } from './useApi.js'

/**
 * Fetches the current user's data (username + entry scores) once `enabled`
 * becomes true. Centralized here so both Header (username) and MainPage
 * (userScores) can share a single fetch instead of duplicating it.
 */
function useCurrentUser(enabled) {
	const [username, setUsername] = useState('')
	const [userScores, setUserScores] = useState([])

	const refreshUserData = useCallback(() => {
		if(!enabled) return
		apiGet('/user/me').then((data) => {
			setUsername(data.username)
			setUserScores(data.user_scores || [])
		})
	}, [enabled])

	useEffect(() => { refreshUserData() }, [refreshUserData])

	return {username, userScores, refreshUserData, setUserScores}
}

export { useCurrentUser }
