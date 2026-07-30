/** Every existing topic id, for the periodic score computation cycle to iterate over. */
async function getAllTopicIds(sqlite) {
	const rows = await sqlite.all('SELECT id FROM topics')
	return rows.map((r) => r.id)
}

export { getAllTopicIds }
