
function VoteSystem() {
	this.entries = new EntryList()
	const voteData = {} // {entryCode1: {entryCode2:'p', entryCode3:'e', entryCode4:'m', ...}, ...}


	const import_registerVotes = (nbsetASCII, type, e1Code) => {
		for(const entryId2 of nbset_toList(nbset_fromPrintableASCII(nbsetASCII))) {
			const e2Code = this.entries.entries[entryId2].code
			this.castVote(e1Code, e2Code, type)
		}
	}

	/**
	 * exported data: {
	 * 	l: <EntryList exported data>,
	 * 	v: [{
	 * 		p:<nbset:plus votes>,
	 * 		e:<nbset:equal votes>,
	 * 		m:<nbset:minus votes>,
	 * 	}, ...]
	 * }
	 */
	this.import = function(jsonData) {
		this.entries.import(jsonData.l, false)

		for(const entryId in jsonData.v) {
			const e1Code = this.entries.entries[entryId].code
			const votes = jsonData.v[entryId]
			import_registerVotes(votes.p, 'p', e1Code)
			import_registerVotes(votes.e, 'e', e1Code)
			import_registerVotes(votes.m, 'm', e1Code)
		}
	}


	this.export = function() {
		const out = {l: this.entries.export(), v:[]}

		for(const entry1Code in voteData) {
			const entry1Index = this.entries.getIndexOfEntryByCode(entry1Code)

			// Gather votes to nbSets
			const votesSet = {p:[], e:[], m:[]}
			for(const entry2Code in voteData[entry1Code]) {
				nbset_add(votesSet[voteData[entry1Code][entry2Code]], this.entries.getIndexOfEntryByCode(entry2Code))
			}

			// Compile votes nbSets and add to output
			out.v[entry1Index] = {}
			if(votesSet.p.length) out.v[entry1Index].p = nbset_toPrintableASCII(votesSet.p)
			if(votesSet.e.length) out.v[entry1Index].e = nbset_toPrintableASCII(votesSet.e)
			if(votesSet.m.length) out.v[entry1Index].m = nbset_toPrintableASCII(votesSet.m)
		}
		for(let i=0; i<out.v.length; i++) if(!out.v[i]) out.v[i] = {}
		return out
	}

	/**
	 * vote type: 'p' = entry1Name:p, entry2Name:m
	 * vote type: 'e' = entry1Name:e, entry2Name:e
	 * vote type: 'm' = entry1Name:m, entry2Name:p
	 */
	this.castVote = function(entry1Code, entry2Code, voteType) {
		if(entry1Code < entry2Code) {
			voteData[entry1Code] = voteData[entry1Code]||{}
			voteData[entry1Code][entry2Code] = voteType
		} else {
			voteData[entry2Code] = voteData[entry2Code]||{}
			voteData[entry2Code][entry1Code] = (voteType==='m'?'p':(voteType==='p'?'m':'e'))
		}
	}

	this.hasData = function() {
		return this.entries.entries > 0
	}

	this.reset = function() {
		this.entries = new EntryList()
		for(const key in voteData) {
			delete voteData[key]
		}
	}

	this.removeEntry = function(entryCode) {
		const index = this.entries.getIndexOfEntryByCode(entryCode)
		if(index < 0) return

		// remove from entryList
		const entry = this.entries.entries[index]
		this.entries.entries[index] = this.entries.entries[this.entries.entries.length-1]
		this.entries.entries.length--

		// remove vote data
		delete voteData[entry.code]
		for(const v in voteData) if(voteData[v][entry.code]) delete voteData[v][entry.code]

		return entry
	}

	this.getFullVotesList = function() {
		// Aggregate data
		const tmpScores = {}
		for(const c1 in voteData) {
			const c1Score = (tmpScores[c1] || {c: this.entries.getEntryByCode(c1), p:[], e:[], m:[], t:1}) // init score
			tmpScores[c1] = c1Score
			for(const c2 in voteData[c1]) {
				const c2Score = (tmpScores[c2] || {c: this.entries.getEntryByCode(c2), p:[], e:[], m:[], t:1}) // init score
				tmpScores[c2] = c2Score
				c1Score[voteData[c1][c2]].push(c2)
				c2Score[voteData[c1][c2] === 'p' ? 'm' : (voteData[c1][c2] === 'm' ? 'p' : 'e')].push(c1)
			}
		}

		/* [{c: <Entry object>, p:[], e:[], m:[], t:1}, ...] */
		return Object.values(tmpScores)
	}

	this.getVote = function(c1, c2) {
		const a1 = (c1<c2?c1:c2)
		const a2 = (c1<c2?c2:c1)
		return voteData[a1] && voteData[a2]
	}
}

function EntryList() {
	this.entries = []

	this.import = function(jsonData, merge=false) {
		if(!merge) while(this.entries.length) this.entries.pop()

		const fc_idListToList = (tagIdList,categoryId)=>tagIdList.map((id)=>jsonData.t[categoryId][id])

		for(const entryData of jsonData.e) {
			// Decode tags
			entryData.t = entryData.t.map(nbset_fromPrintableASCII).map(fc_idListToList)

			const entry = (merge && this.getEntryByName(entryData.n)) || new Entry()
			this.entries.push(entry.import(entryData, merge))
		}
	}
	/**
	 * exported Data: {
	 * 	t: [{               >> ORDER IS IMPORTANT
	 * 		n: category1,
	 * 		t: [tag1, ...]  >> ORDER IS IMPORTANT
	 * 	}, ...],
	 * 	e: [{
	 * 		n: entryName,
	 * 		i: [entryImage1, ...],
	 * 		t: [<nbset:tagsOfCategory1>, <nbset:tagsOfCategory2>, ...]  >> ORDER IS IMPORTANT
	 * 	}, ...]
	 * }
	 */
	this.export = function() {
		const entriesList = this.entries.map(e=>e.export())

		// Build tags list
		const categoryList = []
		const tagsList = []
		for(const e of entriesList) {
			const entryTags = e.t // {category1: [tag1, tag2, ...], ...}
			for(const categoryName in entryTags) {
				let catIndex = categoryList.indexOf(categoryName)
				if(catIndex < 0) {
					catIndex = categoryList.length
					categoryList.push(categoryName)
					tagsList[catIndex] = {n: categoryName, t:[]}
				}
				const currCategoryTagList = tagsList[catIndex].t

				const tagsSet = []
				for(const tagName of entryTags[categoryName]) {
					let tagIndex = currCategoryTagList.indexOf(tagName)
					if(tagIndex < 0) {
						tagIndex = currCategoryTagList.length
						currCategoryTagList.push(tagName)
					}
					nbset_add(tagsSet, tagIndex)
				}
				entryTags[categoryName] = nbset_toPrintableASCII(tagsSet)
			}

			e.t = []
			for(const catIndex in categoryList) {
				if(entryTags[categoryList[catIndex]]) e.t.push(entryTags[categoryList[catIndex]])
				else e.t.push([])
			}

			while(e.t.length && e.t[e.t.length-1].length <= 0) e.t.pop()
		}

		return {
			t: tagsList,
			e: entriesList,
		}
	}

	this.getEntryByName = function(entryName) {
		return this.entries.find(e=>e.name === entryName)
	}
	this.getEntryByCode = function(entryCode) {
		return this.entries.find(e=>e.code === entryCode)
	}
	this.getIndexOfEntryByCode = function(entryCode) {
		for(const id in this.entries) if(this.entries[id].code === entryCode) return id
		return -1
	}

	/**
	 * {categoryName: [tag1, tag2, ...], ...}
	 */
	this.getTagsList = function() {
		const list = this.export().t
		const tagsMap = {}
		for(const m of list) {
			tagsMap[m.n] = m.t
		}
		return tagsMap
	}

	this.getOrCreateByName = function(entryName) {
		// If entry name does not exist: create it
		let e = this.getEntryByName(entryName)
		if(!e) {
			e = new Entry(entryName)
			this.entries.push(e)
		}
		return e
	}

	this.add = function(entry) {
		this.entries.push(entry)
	}
}

let ENTRY_CODES=0
function Entry(entryName) {
	this.code = 'e' + (ENTRY_CODES++)
	this.name = entryName || ''
	this.images = []
	this.tags = {} // {category1: [label1, ...], ...}

	this.import = function(jsonData, merge=false) {
		if(!merge) {
			this.name = jsonData.n
			this.images = []
			this.tags = {}
		}
		for(const i of jsonData.i) if(this.images.indexOf(i) < 0) this.images.push(i)
		for(const l in jsonData.l) {
			this.tags[l] = this.tags[l]||[]
			for(const t of jsonData.l[l]) if(this.tags[l].indexOf(t) < 0) this.tags[l].push(t)
		}
		return this
	}
	this.export = function() {
		return {n: this.name, i: this.images, t:this.tags}
	}
}
