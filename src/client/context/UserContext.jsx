import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { apiGet } from '../hooks/useApi.js'

const UserContext = createContext(null)
const POLL_INTERVAL_MS = 30000

/**
 * Single source of truth for auth + current user data, shared by every
 * consumer via context instead of each re-instantiating useAuth()/fetching
 * /user/me on its own (which used to cause duplicate fetches and left the
 * Header out of sync after login/logout).
 */
function UserProvider({children}) {
	const auth = useAuth()

	const [username, setUsername] = useState(null)
	const [userScores, setUserScores] = useState([])
	const [userVotes, setUserVotes] = useState([])
	const pollTimeoutRef = useRef(null)

	/**
	 * Fetches the current user's data. Called on mount/auth change, on a
	 * timer every 30s, and manually by callers (quiz components, right after
	 * voting, so the new score shows up immediately). Every call - manual or
	 * scheduled - cancels and reschedules the poll timer, so a manual refresh
	 * never gets immediately followed by a redundant scheduled one. Returns
	 * the freshly fetched scores, so a caller that needs them right away
	 * (e.g. to pick the next quiz pair) doesn't have to wait for the next
	 * render to see the updated `userScores`.
	 */
	const refreshUserData = useCallback(async () => {
		if(pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)

		if(!auth.isAuthenticated) {
			setUsername(null)
			setUserScores([])
			setUserVotes([])
			return []
		}
		const data = await apiGet('/user/me')
		setUsername(data.username)
		setUserScores(data.user_scores || [])
		setUserVotes(data.votes || [])
		pollTimeoutRef.current = setTimeout(refreshUserData, POLL_INTERVAL_MS)
		return data.user_scores || []
	}, [auth.isAuthenticated])

	useEffect(() => {
		refreshUserData()
		return () => { if(pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current) }
	}, [refreshUserData])

	const value = {
		isAuthenticated: auth.isAuthenticated,
		isLoading: auth.isLoading,
		login: auth.login,
		register: auth.register,
		logOut: auth.logOut,
		username,
		userScores,
		setUserScores,
		userVotes,
		refreshUserData,
	}

	return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

function useUserContext() {
	return useContext(UserContext)
}

export { UserProvider, useUserContext }
