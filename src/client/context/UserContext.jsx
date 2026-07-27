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
	const [scoredEntriesCount, setScoredEntriesCount] = useState(0)
	const [isAdmin, setIsAdmin] = useState(false)
	// Bumped by every action that changes a user's scores (vote, entry
	// creation, score removal). Views showing a paginated score table
	// (usePaginatedList's `dependsOn`) watch this to refetch their current
	// page immediately, replacing the synchronization the old global 30s
	// poll used to provide implicitly across views.
	const [entriesVersion, setEntriesVersion] = useState(0)
	const bumpEntriesVersion = useCallback(() => setEntriesVersion((v) => v + 1), [])

	/**
	 * Fetches the current user's own data (username, scored entries count) —
	 * never the paginated lists themselves, see GET /api/user/me/entities
	 * (scores) and GET /api/user/me/quiz (vote history) for those. Called on
	 * mount/auth change, and manually by callers (quiz/vote components, right
	 * after acting, so username/count show up immediately).
	 */
	const refreshUserData = useCallback(async () => {
		if(!auth.isAuthenticated) {
			setUsername(null)
			setScoredEntriesCount(0)
			setIsAdmin(false)
			return
		}
		const data = await apiGet('/user/me')
		setUsername(data.username)
		setScoredEntriesCount(data.scoredEntriesCount || 0)
		setIsAdmin(!!data.isAdmin)
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
		scoredEntriesCount,
		isAdmin,
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
