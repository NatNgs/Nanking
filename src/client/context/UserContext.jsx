import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { apiGet } from '../hooks/useApi.js'

const UserContext = createContext(null)

/**
 * Single source of truth for auth + current user data, shared by every
 * consumer via context instead of each re-instantiating useAuth()/fetching
 * /user/me on its own (which used to cause duplicate fetches and left the
 * Header out of sync after login/logout).
 */
function UserProvider({children}) {
	const auth = useAuth()

	const [username, setUsername] = useState(null)
	const [userVotes, setUserVotes] = useState([])
	const [scoredEntriesCount, setScoredEntriesCount] = useState(0)
	// Bumped by every action that changes a user's scores (vote, entry
	// creation, score removal). Views showing a paginated score table
	// (usePaginatedList's `dependsOn`) watch this to refetch their current
	// page immediately, replacing the synchronization the old global 30s
	// poll used to provide implicitly across views.
	const [entriesVersion, setEntriesVersion] = useState(0)
	const bumpEntriesVersion = useCallback(() => setEntriesVersion((v) => v + 1), [])

	/**
	 * Fetches the current user's own data (username, votes, scored entries
	 * count) — never the paginated score list itself, see
	 * GET /api/user/me/entities for that. Called on mount/auth change, and
	 * manually by callers (quiz/vote components, right after acting, so
	 * username/votes/count show up immediately).
	 */
	const refreshUserData = useCallback(async () => {
		if(!auth.isAuthenticated) {
			setUsername(null)
			setUserVotes([])
			setScoredEntriesCount(0)
			return
		}
		const data = await apiGet('/user/me')
		setUsername(data.username)
		setUserVotes(data.votes || [])
		setScoredEntriesCount(data.scoredEntriesCount || 0)
	}, [auth.isAuthenticated])

	useEffect(() => {
		refreshUserData()
	}, [refreshUserData])

	const value = {
		isAuthenticated: auth.isAuthenticated,
		isLoading: auth.isLoading,
		login: auth.login,
		register: auth.register,
		logOut: auth.logOut,
		username,
		userVotes,
		scoredEntriesCount,
		entriesVersion,
		bumpEntriesVersion,
		refreshUserData,
	}

	return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

function useUserContext() {
	return useContext(UserContext)
}

export { UserProvider, useUserContext }
