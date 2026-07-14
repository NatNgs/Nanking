function importMALuserData() {
	// Ask for username and client ID
	const username = prompt("Please enter your MAL username")
	if(username) {
		const clientId = prompt("Please enter your MAL Client ID (get this from https://myanimelist.net/apiconfig)")
		if(clientId) {
			callMALuserAPI(username, clientId, 0, (data)=>{
				if(!data || !data.length) return

				const ENTRY_LIST = VOTE_SYSTEM.entries
				const VOTE_DATA = VOTE_SYSTEM.getVoteData()
				const needToUpdateView = ENTRY_LIST.entries.length <= 1

				for(const animeData of data) {
					if(!animeData.watched_episodes) continue

					const entry = ENTRY_LIST.getOrCreateByName(animeData.title)
					const code = 'mal_' + animeData.mal_id

					if(animeData.tags) {
						if(!('misc' in entry.tags)) entry.tags.misc = animeData.tags
						else animeData.tags.forEach(tag=>entry.tags.misc.push(tag))
					}

					if(entry.code !== code) {
						entry.code = code
						// Update vote data
						VOTE_DATA[code] = VOTE_DATA[entry.code]
						delete VOTE_DATA[entry.code]
						for(const v in VOTE_DATA) if(VOTE_DATA[v][entry.code]) {
							VOTE_DATA[v][code] = VOTE_DATA[v][entry.code]
							delete VOTE_DATA[v][entry.code]
						}
					}
					if(animeData.image_url && entry.images.length <= 0) entry.images.push(animeData.image_url)
					if(animeData.type) entry.tags.type = [animeData.type]
					if(animeData.score) entry.tags[username + '_score'] = [animeData.score]
					if(animeData.totalEpisodes) entry.tags.episodes = [animeData.totalEpisodes]
					if(animeData.rating) entry.tags.rating = [animeData.rating]
					if(animeData.start_date && animeData.end_date) {
						entry.tags.year = []
						for(let y = +animeData.start_date.substr(0,4); y <= +animeData.end_date.substr(0,4); y++)
							entry.tags.year.push(y)
					}
					if(animeData.genres && animeData.genres.length) {
						if(!('genres' in entry.tags)) entry.tags.genres = []
						else animeData.genres.forEach(genreData=>entry.tags.genres.push(genreData.name))
					}
				}

				// Automatically cast votes according to scores
				const itemsByTag = ENTRY_LIST.getItemsByTag().byTag[username + '_score']
				if(itemsByTag) {
					let casted = 0
					let noncasted = 0
					for(let score1 = 1; score1 <= 9; score1++) {
						const itemsLowScore = itemsByTag[score1]
						if(!itemsLowScore || itemsLowScore.length <= 0) continue
						for(let score2 = score1+1; score2 <= 10; score2++) {
							const itemsHighScore = itemsByTag[score2]
							if(!itemsHighScore ||itemsHighScore.length <= 0) continue
							for(const e1 of itemsLowScore) for(const e2 of itemsHighScore) {
								const currentVote = VOTE_SYSTEM.getVote(e1, e2)
								if(!currentVote) {
									VOTE_SYSTEM.castVote(e2, e1, 'p')
									casted ++
								} else {
									noncasted ++
								}
							}
						}
					}
					console.log('Casted ' + casted + ' auto votes, ignored ' + noncasted + ' votes')
				}

				setTimeout(updateCategoriesSelector)
				if(needToUpdateView) {
					setTimeout(prepareNextVote)
				}
			})
		}
	}
}

function callMALuserAPI(username, clientId, offset, cb) {
	const d = new Date()
	const limit = 100
	const fields = 'list_status,num_episodes,mean,genres,start_date,end_date,media_type,main_picture,rating'
	const url = 'https://api.myanimelist.net/v2/users/' + encodeURIComponent(username) + '/animelist?offset=' + offset + '&limit=' + limit + '&fields=' + encodeURIComponent(fields) + '&sort=list_score'

	console.info('GET', url)
	$.ajax({
		url: url,
		dataType: 'json',
		headers: {
			'X-MAL-CLIENT-ID': clientId
		},
		timeout: 10000,
		success: (response)=>{
			if(response.data && response.data.length) {
				console.info('Success', url, (new Date() - d) + 'ms')

				// Transform MAL API v2 response to match expected format
				const transformedData = response.data.map(item => ({
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
				}))

				cb(transformedData)

				// Continue pagination if there are more results
				if(response.paging?.next) {
					setTimeout(()=>callMALuserAPI(username, clientId, offset + limit, cb), 1000)
				}
			} else {
				console.warn('No data', url, (new Date() - d) + 'ms')
				cb([])
			}
		},
		error: (jqXHR, textStatus, errorThrown)=>{
			console.warn('Error', url, (new Date() - d) + 'ms', {jqXHR, textStatus, errorThrown})
			cb([])
		}
	})
}
