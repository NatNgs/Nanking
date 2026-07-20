import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { UserProvider } from './context/UserContext.jsx'
import router from './router.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
	<UserProvider>
		<RouterProvider router={router} />
	</UserProvider>,
)
