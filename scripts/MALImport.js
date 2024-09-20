

function importMALuserData() {
	// Ask for username
	const username = prompt("Please enter your MAL username")
	if(username) {
		callMALuserAPI(username, 1, (data)=>{
			if(!data || !data.length) return

			const ENTRY_LIST = VOTE_SYSTEM.entries
			const VOTE_DATA = VOTE_SYSTEM.getVoteData()
			const needToUpdateView = ENTRY_LIST.entries.length <= 1

			for(const animeData of data) {
				if(!animeData.watched_episodes) continue

				const entry = ENTRY_LIST.getOrCreateByName(animeData.title)
				const code = 'mal_' + animeData.mal_id

				if(animeData.tags) {
					if(!('misc' in entry.tags)) entry.tags.misc = animeData.tags.split(',')
					else animeData.tags.split(',').forEach(tag=>entry.tags.misc.push(tag))
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
				if(animeData.demographics && animeData.demographics.length) {
					if(!('demographics' in entry.tags)) entry.tags.demographics = []
					else animeData.demographics.forEach(demographicData=>entry.tags.demographics.push(demographicData.name))
				}
			}

			// Automatically cast votes according to scores (if no vote yet casted and MAL score is higher: vote up, else ignore)
			const itemsByTag = ENTRY_LIST.getItemsByTag().byTag[username + '_score'] // {tag: [eId1, eId2, ...], ...}
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

			// Update the UI
			setTimeout(updateCategoriesSelector)
			if(needToUpdateView) {
				setTimeout(prepareNextVote)
			}
		})
	}
}

function callMALuserAPI(username, part, cb) {
	const d = new Date()
	const url = 'https://api.jikan.moe/v3/user/' + encodeURIComponent(username) + '/animelist/all/'+ part
	console.info('GET', url)
	$.ajax({
		url: url,
		dataType: 'json',
		timeout: 10000, //10 second timeout
		success: (data)=>{
			if(data.anime && data.anime.length) {
				console.info('Success', url, (new Date() - d) + 'ms')
				cb(data.anime)
				if(data.anime.length >= 300) {
					setTimeout(()=>callMALuserAPI(username, part + 1, cb), (data.cached)?100:3000)
				}
			} else {
				console.warn('No data', url, (new Date() - d) + 'ms')
			}
		},
		error: (jqXHR, textStatus, errorThrown)=>{
			console.warn('Error', url, (new Date() - d) + 'ms', {jqXHR, textStatus, errorThrown})
			cb([])
		}
	})
}
