import { existsSync } from 'node:fs'
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import axios from 'axios'

function main(dbPath, username, malClientId) {
	// Load nanking data
	if(!existsSync(dbPath)) {
		console.error('Database file not found')
		return
	}

	username = username || prompt("Please enter your MAL username")
	malClientId = malClientId || prompt("Please enter your MAL Client ID (get this from https://myanimelist.net/apiconfig)")
	const nankingData = JSON.parse(gunzipSync(readFileSync(dbPath)).toString('utf8'))

	importMALuserData(username, malClientId, nankingData, (nb)=>{
		// Save data to file
		writeFileSync(dbPath, gzipSync(JSON.stringify(nankingData)))
		//console.log('\n\n----------\n\n')
		//console.log(nankingData)
		console.log('Imported ', nb, ' MAL entries')
	})

}

function importMALuserData(username, clientId, nankingData, cb) {
	if(!nankingData.users[username]) nankingData.users[username] = {quiz:[]}
	let newData = 0
	const userQuizData = nankingData.users[username].quiz
	callMALuserAPI(username, clientId, 0, (animeData)=>{
		// If anime is not watched or not scored, skip it
		if(animeData.watched_episodes < 1 || !animeData.score) return

		// Find the entry if already exists, if not create it
		const entryName = animeData.title
		const entryIndex = 'mal:' + animeData.mal_id
		const entryImage = animeData.image_url
		const userScore = animeData.score

		let entry = nankingData.entries[entryIndex]
		if(!entry) {
			// Create the new entry
			nankingData.entries[entryIndex] = {
				name: entryName,
				image: entryImage,
			}
		}

		// Update the user score
		// Find if no previous userQuizData of type 'direct' and with that same entry : if already present in list, ignore
		if(!userQuizData.find((q) => (q.type === 'direct' || q.type === 'default') && q.entry === entryIndex)) {
			userQuizData.push({
				type: 'direct',
				entry: entryIndex,
				value: (userScore-1)/9,
			})
			newData ++
		}
	}, ()=>{
		cb(newData)
	})
}

function callMALuserAPI(username, clientId, offset, cb, onEnd) {
	const d = new Date()
	const limit = 100
	const fields = 'list_status,num_episodes,mean,genres,start_date,end_date,media_type,main_picture,rating'
	const url = 'https://api.myanimelist.net/v2/users/' + encodeURIComponent(username) + '/animelist?offset=' + offset + '&limit=' + limit + '&fields=' + encodeURIComponent(fields) + '&sort=list_score'

	console.info('GET', url)
	axios.get(url, {
		accept: 'application/json',
		headers: {
			'X-MAL-CLIENT-ID': clientId
		},
	}).then((response)=>{
		if(response?.data?.data?.length) {
			console.info('Success', url, (new Date() - d) + 'ms')

			// Transform MAL API v2 response to match expected format
			for(const item of response.data.data) {
				cb({
					mal_id: item.node.id,
					title: item.node.title,
					image_url: item.node.main_picture?.large,
					type: item.node.media_type,
					score: item.list_status?.score,
					watched_episodes: item.list_status?.num_episodes_watched,
					totalEpisodes: item.node.num_episodes,
					rating: item.node.rating,
					start_date: item.node.start_date,
					end_date: item.node.end_date,
					genres: item.node.genres,
					tags: item.list_status?.tags || []
				})
			}

			// Continue pagination if there are more results
			if(response.data.paging?.next) {
				setTimeout(()=>callMALuserAPI(username, clientId, offset + limit, cb, onEnd), 1000)
			} else {
				onEnd()
			}
		} else {
			console.warn('No data', url, (new Date() - d) + 'ms')
			console.log(response.data)
			onEnd()
		}
	}).catch((error)=>{
		if(!error?.response?.status)
			console.error( (new Date() - d) + 'ms', 'MAL returned Error', error)
		else
			console.warn( (new Date() - d) + 'ms', 'MAL returned Error', error.response.status, error.response.statusText, ':', error.response.data.message)
		onEnd()
	})
}


// Parse arguments
const args = process.argv.slice(2) // node src/scripts/MALImport.js dbPath username malClientId
main(...args)
