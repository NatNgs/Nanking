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
	const [userScores, setUserScores] = useState([])
	const [userVotes, setUserVotes] = useState([])

	const refreshUserData = useCallback(async () => {
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
	}, [auth.isAuthenticated])

	useEffect(() => { refreshUserData() }, [refreshUserData])

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
