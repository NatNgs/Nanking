import { useState, useEffect, useRef } from 'react'
import { useOutletContext, useSearchParams, Navigate } from 'react-router'
import { useUserContext } from '../../context/UserContext.jsx'
import { apiGet, apiPost } from '../../hooks/useApi.js'
import EntrySpan from '../entry/EntrySpan.jsx'
import EntryPicker from './EntryPicker.jsx'
import RecentVotesTable from './RecentVotesTable.jsx'
import './DualQuiz.css'

/** Normalizes a GET /api/entry/:id response into the {id, label, image, score} shape used here. */
function toSide(entryData) {
	return {id: entryData.id, label: entryData.name, image: entryData.image, score: entryData.userScore}
}

/**
 * Displays two entries side by side with 3 voting buttons (left/tie/right),
 * plus a "Randomize" button per side and one for both, and a manual entry
 * picker per side. The initial pair honors the optional `left`/`right` query
 * params (explicit entry ids); any side left unspecified is picked
 * server-side, weighted by score proximity with the other side when known
 * (see src/server/services/dualQuizService.js).
 */
function DualQuiz() {
	const {scoreFormatter} = useOutletContext()
	const {isAuthenticated, isLoading, refreshUserData, bumpEntriesVersion} = useUserContext()
	const [searchParams] = useSearchParams()
	const [isVoting, setIsVoting] = useState(true)
	const [left, setLeft] = useState(null)
	const [right, setRight] = useState(null)
	const [error, setError] = useState(null)
	const abortRef = useRef(null)

	// Runs `fn(controller)`, aborting any previous in-flight request from this
	// component first. Used for every fetch below so only the latest one can
	// ever update state (a stale randomize/vote response never clobbers a
	// newer one).
	async function withAbort(fn) {
		abortRef.current?.abort()
		const controller = new AbortController()
		abortRef.current = controller

		setIsVoting(true)
		try {
			await fn(controller)
			if(!controller.signal.aborted) setError(null)
		} catch (err) {
			if(!controller.signal.aborted) setError(err)
		} finally {
			if(!controller.signal.aborted) setIsVoting(false)
		}
	}

	// Fetches a whole new pair (initial load without left/right, or "Randomize both").
	function fetchNewPair() {
		return withAbort(async (controller) => {
			const pair = await apiGet('/quiz/dual', null, {signal: controller.signal})
			if(controller.signal.aborted) return
			setLeft(pair.left)
			setRight(pair.right)
		})
	}

	// Suggests a single side, excluding its current entry, weighted against the other side when known.
	function randomizeSide(side) {
		return withAbort(async (controller) => {
			const other = side === 'left' ? right : left
			const current = side === 'left' ? left : right
			const suggestion = await apiPost('/quiz/dual/suggest', {
				fixed: other?.id ?? null,
				exclude: current ? [current.id] : [],
			}, {signal: controller.signal})
			if(controller.signal.aborted) return
			if(side === 'left') setLeft(suggestion)
			else setRight(suggestion)
		})
	}

	// Loads the initial pair, honoring the left/right query params: both given
	// loads them directly by id, one given fills the other side via suggestion,
	// none given picks a full random pair (unchanged legacy behavior).
	function loadInitialPair() {
		return withAbort(async (controller) => {
			const leftId = searchParams.get('left')
			const rightId = searchParams.get('right')

			if(leftId && rightId) {
				const [l, r] = await Promise.all([
					apiGet('/entry/' + leftId, null, {signal: controller.signal}),
					apiGet('/entry/' + rightId, null, {signal: controller.signal}),
				])
				if(controller.signal.aborted) return
				setLeft(toSide(l))
				setRight(toSide(r))
				return
			}
			if(leftId || rightId) {
				const knownId = leftId || rightId
				const known = toSide(await apiGet('/entry/' + knownId, null, {signal: controller.signal}))
				const suggestion = await apiPost(
					'/quiz/dual/suggest', {fixed: known.id, exclude: [known.id]}, {signal: controller.signal},
				)
				if(controller.signal.aborted) return
				if(leftId) {
					setLeft(known)
					setRight(suggestion)
				} else {
					setLeft(suggestion)
					setRight(known)
				}
				return
			}

			const pair = await apiGet('/quiz/dual', null, {signal: controller.signal})
			if(controller.signal.aborted) return
			setLeft(pair.left)
			setRight(pair.right)
		})
	}

	async function vote(value) {
		// Disable voting while the vote is being sent
		setIsVoting(true)
		try {
			await apiPost('/quiz/dual', {neg: left.id, value, pos: right.id})
			await refreshUserData()
			bumpEntriesVersion()
		} finally {
			await fetchNewPair()
		}
	}

	async function pickManually(side, entryId) {
		const entryData = await apiGet('/entry/' + entryId)
		if(side === 'left') setLeft(toSide(entryData))
		else setRight(toSide(entryData))
	}

	// Fetch the initial pair once on mount. Only a vote or an explicit
	// randomize picks a new pair/side afterwards. Aborts any in-flight fetch
	// on unmount, so a late response never calls setState on an unmounted
	// component.
	useEffect(() => {
		loadInitialPair()
		return () => abortRef.current?.abort()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Wait for the initial /user/me check (see useAuth.js) before deciding to
	// redirect: on a full page load (e.g. navigating straight to /quiz/dual),
	// isAuthenticated starts false until that check resolves, since a HttpOnly
	// cookie can't be inspected synchronously the way a stored token could.
	if(isLoading) return null
	if(!isAuthenticated) return <Navigate to="/" replace />

	return (
		<div className="dual-quiz">
			{error && <p role="alert">Not enough scored entries yet for a duel.</p>}
			<table className="dual-quiz-pair-table">
				<tr>
					<td className="dual-quiz-left">
						<button
							className="dual-quiz-randomize" disabled={isVoting} onClick={() => randomizeSide('left')}
						>↺ Randomize</button>
						<EntryPicker onSelect={(entryId) => pickManually('left', entryId)} />
					</td>
					<td className="dual-quiz-right">
						<button
							className="dual-quiz-randomize" disabled={isVoting} onClick={() => randomizeSide('right')}
						>↺ Randomize</button>
						<EntryPicker onSelect={(entryId) => pickManually('right', entryId)} />
					</td>
				</tr>
				{ left && right && (
					<>
						<tr>
							<td className="dual-quiz-left">
								<img src={'/api/entry/' + left.id + '/image.png'}/><br/>
								<EntrySpan id={left.id} label={left.label} />
							</td>
							<td className="dual-quiz-right">
								<img src={'/api/entry/' + right.id + '/image.png'}/><br/>
								<EntrySpan id={right.id} label={right.label} />
							</td>
						</tr>
						<tr>
							<td colSpan="2">
								<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(-1)}>
									^ Choose
								</button>
								<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(0)}>No Best</button>
								<button className="dual-quiz-bt3" disabled={isVoting} onClick={() => vote(1)}>Choose ^</button>
							</td>
						</tr>
						<tr>
							<td colSpan="2">
								<button className="dual-quiz-randomize-both" disabled={isVoting} onClick={fetchNewPair}>
									Randomize both
								</button>
							</td>
						</tr>
					</>
				)}
			</table>
			<RecentVotesTable scoreFormatter={scoreFormatter} type="dual" limit={5} showPagination />
		</div>
	)
}

export default DualQuiz
