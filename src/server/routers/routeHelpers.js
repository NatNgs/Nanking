/**
 * Builds a `(id, res, ...args) => void` responder: fetches the resource via
 * `getData(id, ...args)`, replies 404 with `notFoundMessage` if it doesn't
 * exist, otherwise replies with the resource as JSON. Used to build
 * `respondWithEntryData`/`respondWithTagData` from their respective services.
 */
function respondWithData(getData, notFoundMessage) {
	return (id, res, ...args) => {
		const data = getData(id, ...args)
		if(!data) return res.status(404).send(notFoundMessage)
		res.json(data)
	}
}

/**
 * Maps a service's string result code to an HTTP status + message and sends
 * it, if `result` is a key of `mapping`. Returns true when it did (the caller
 * should stop there), false otherwise (the caller falls through to its own
 * success response). Centralizes the repeated
 * `if(result === 'x') return res.status(...).send(...)` chains.
 */
function sendByResult(res, result, mapping) {
	const entry = mapping[result]
	if(!entry) return false
	res.status(entry.status).send(entry.message)
	return true
}

export { respondWithData, sendByResult }
