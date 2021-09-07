
function VoteSystem() {
	this.entries = new EntryList()
	const _voteData = {} // {eId1: {eId2:'p', eId3:'e', eId4:'m', ...}, ...}

	const import_registerVotes = (nbsetASCII, type, eId) => {
		for(const entryId2 of NB_SET.toList(NB_SET.fromPrintableASCII(nbsetASCII))) {
			const e2Code = this.entries.entries[entryId2].code
			this.castVote(eId, e2Code, type)
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

		for(const i in jsonData.v) {
			const eId = this.entries.entries[i].code
			const votes = jsonData.v[i]
			import_registerVotes(votes.p, 'p', eId)
			import_registerVotes(votes.e, 'e', eId)
			import_registerVotes(votes.m, 'm', eId)
		}
	}

	this.export = function() {
		const out = {l: this.entries.export(), v:[]}

		for(const eId1 in _voteData) {
			const entry1Index = this.entries.getIndexOfEntryByCode(eId1)

			// Gather votes to nbSets
			const votesSet = {p:[], e:[], m:[]}
			for(const eId2 in _voteData[eId1]) {
				NB_SET.add(votesSet[_voteData[eId1][eId2]], this.entries.getIndexOfEntryByCode(eId2))
			}

			// Compile votes nbSets and add to output
			out.v[entry1Index] = {}
			if(votesSet.p.length) out.v[entry1Index].p = NB_SET.toPrintableASCII(votesSet.p)
			if(votesSet.e.length) out.v[entry1Index].e = NB_SET.toPrintableASCII(votesSet.e)
			if(votesSet.m.length) out.v[entry1Index].m = NB_SET.toPrintableASCII(votesSet.m)
		}
		for(let i=0; i<out.v.length; i++) if(!out.v[i]) out.v[i] = {}
		return out
	}

	/**
	 * vote type: 'p' = entryName1:p, entryName2:m
	 * vote type: 'e' = entryName1:e, entryName2:e
	 * vote type: 'm' = entryName1:m, entryName2:p
	 */
	this.castVote = function(eId1, eId2, voteType) {
		if(voteType === 'p' || voteType === 'e' || voteType === 'm') {
			if(eId1 < eId2) {
				if(!(eId1 in _voteData)) _voteData[eId1] = {}
				_voteData[eId1][eId2] = voteType
			} else {
				if(!(eId2 in _voteData)) _voteData[eId2] = {}
				_voteData[eId2][eId1] = (voteType==='m'?'p':(voteType==='p'?'m':'e'))
			}
		}
		this.entries.getEntryByCode(eId1).lastVote = this.entries.getEntryByCode(eId2).lastVote = new Date()
	}

	this.hasData = function() {
		return this.entries.entries > 0
	}

	this.reset = function() {
		this.entries = new EntryList()
		for(const key in _voteData) {
			delete _voteData[key]
		}
	}

	this.removeEntry = function(eId) {
		const index = this.entries.getIndexOfEntryByCode(eId)
		if(index < 0) return

		// remove from entryList
		const entry = this.entries.entries[index]
		this.entries.entries[index] = this.entries.entries[this.entries.entries.length-1]
		this.entries.entries.length--

		// remove vote data
		delete _voteData[entry.code]
		for(const v in _voteData) if(_voteData[v][entry.code]) delete _voteData[v][entry.code]

		return entry
	}

	/** returns {eId: {entry: <Entry object>, p:[], e:[], m:[]}, ...} */
	this.getFullDirectVotesMap = function() {
		// Aggregate data
		const scoreMap = {}

		// Compute direct votes into p/e/m
		for(const e of this.entries.entries) {
			scoreMap[e.code] = {entry: e, p:[], e:[], m:[]} // init score
		}
		for(const c1 in _voteData) {
			for(const c2 in _voteData[c1]) {
				scoreMap[c1][_voteData[c1][c2]].push(c2)
				scoreMap[c2][_voteData[c1][c2] === 'p' ? 'm' : (_voteData[c1][c2] === 'm' ? 'p' : 'e')].push(c1)
			}
		}

		return scoreMap
	}
	/** returns {eId: {entry: <Entry object>, p:[], e:[], m:[]}, ...} */
	this.getFullIndirectVotesMap = function(directVotesMap) {
		const scoreMap = JSON.parse(JSON.stringify(directVotesMap))

		// Compute indirect votes into p2/e2/m2
		let again = true
		while(again) {
			again = false

			for(const c1 in scoreMap) {
				scoreMap[c1].ptmp = []
				scoreMap[c1].etmp = []
				scoreMap[c1].mtmp = []
			}

			// Fill ptmp/etmp/mtmp
			for(const c1 in scoreMap) {
				const sc1 = scoreMap[c1]
				for(const c2 of sc1.p) {
					const sc2 = scoreMap[c2]
					for(const c3 of sc1.m) {
						const sc3 = scoreMap[c3]
						if(sc2.mtmp.indexOf(c3) < 0) sc2.mtmp.push(c3)
						if(sc3.ptmp.indexOf(c2) < 0) sc3.ptmp.push(c2)
					}
				}
				for(const c2 of sc1.e) {
					const sc2 = scoreMap[c2]
					for(const c3 of sc1.e) if(sc2.etmp.indexOf(c3) < 0) sc2.etmp.push(c3)
				}
			}
			// Add to p2/e2/m2 if no conflict
			for(const c1 in scoreMap) {
				const sc1 = scoreMap[c1]
				for(const p of sc1.ptmp) {
					if(p !== c1
					&& sc1.p.indexOf(p) < 0 && sc1.e.indexOf(p) < 0 && sc1.m.indexOf(p) < 0
					&& sc1.etmp.indexOf(p) < 0 && sc1.mtmp.indexOf(p) < 0) {
						sc1.p.push(p)
						again = true
					}
				}
				for(const e of sc1.etmp) {
					if(e !== c1
					&& sc1.p.indexOf(e) < 0 && sc1.e.indexOf(e) < 0 && sc1.m.indexOf(e) < 0
					&& sc1.ptmp.indexOf(e) < 0 && sc1.mtmp.indexOf(e) < 0) {
						sc1.e.push(e)
						again = true
					}
				}
				for(const m of sc1.mtmp) {
					if(m !== c1
					&& sc1.p.indexOf(m) < 0 && sc1.e.indexOf(m) < 0 && sc1.m.indexOf(m) < 0
					&& sc1.etmp.indexOf(m) < 0 && sc1.etmp.indexOf(m) < 0) {
						sc1.m.push(m)
						again = true
					}
				}
			}
		}

		for(const c1 in scoreMap) {
			delete scoreMap[c1].ptmp
			delete scoreMap[c1].etmp
			delete scoreMap[c1].mtmp
		}

		return scoreMap
	}

	this.getVote = function(c1, c2) {
		const a1 = (c1<c2?c1:c2)
		const a2 = (c1<c2?c2:c1)
		return _voteData[a1] && _voteData[a2]
	}
}

function EntryList() {
	this.entries = []

	this.importSimple = function(jsonArray, merge=false) {
		if(!merge) while(this.entries.length) this.entries.pop()

		for(const entryData of jsonArray) {
			const entry = (merge && this.getEntryByName(entryData.n)) || new Entry(entryData.n)
			this.entries.push(entry.import(entryData, merge))
		}
	}
	this.import = function(jsonData, merge=false) {
		if(!merge) while(this.entries.length) this.entries.pop()

		const fc_idListToList = (tagIdList,categoryId)=>NB_SET.toList(NB_SET.fromPrintableASCII(tagIdList)).map((id)=>jsonData.l[categoryId].t[id])

		for(const entryData of jsonData.e) {
			// Decode tags
			const entryDataList = entryData.l.map(fc_idListToList)

			entryData.l = {}
			for(const categoryId in entryDataList) {
				const cat = jsonData.l[categoryId].n
				entryData.l[cat] = entryDataList[categoryId]
			}

			entry = (merge && this.getEntryByName(entryData.n))
			if(!entry) {
				entry = new Entry(entryData.n)
				this.entries.push(entry)
			}
			entry.import(entryData, merge)
		}
	}

	/**
	 * exported Data: [
	 *	{n: name, i: [image1, image2, ...], l:{category1:[tag1, tag2, ...], category2:[tag1, ...], ...}}
	 * ]
	 */
	this.exportSimple = function() {
		return JSON.parse(JSON.stringify(this.entries.map(e=>e.export())))
	}
	/**
	 * exported Data: {
	 * 	l: [{               >> ORDER IS IMPORTANT
	 * 		n: category1,
	 * 		t: [tag1, ...]  >> ORDER IS IMPORTANT
	 * 	}, ...],
	 * 	e: [{
	 * 		n: entryName,
	 * 		i: [entryImage1, ...],
	 * 		l: [<nbset:tagsOfCategory1>, <nbset:tagsOfCategory2>, ...]  >> ORDER IS IMPORTANT
	 * 	}, ...]
	 * }
	 */
	this.export = function() {
		const entryList = this.exportSimple()

		// Build tags list
		const tagsMap = this.getTagsMap()
		const categoryList = Object.keys(tagsMap).sort()
		const tagList = categoryList.map((cat)=>({n: cat, t:tagsMap[cat].sort()}))

		for(const e of entryList) {
			const entryTags = e.l // {category1: [tag1, tag2, ...], ...}
			for(const cat in entryTags) {
				const currCategoryTagList = tagList[categoryList.indexOf(cat)].t

				const tagsSet = []
				for(const tag of entryTags[cat]) {
					NB_SET.add(tagsSet, currCategoryTagList.indexOf(tag))
				}
				entryTags[cat] = NB_SET.toPrintableASCII(tagsSet)
			}

			e.l = []
			for(const catIndex in categoryList) {
				if(entryTags[categoryList[catIndex]]) e.l.push(entryTags[categoryList[catIndex]])
				else e.l.push("")
			}

			while(e.l.length && !(e.l[e.l.length-1])) e.l.pop()
		}

		return {
			l: tagList,
			e: entryList,
		}
	}

	this.getEntryByName = function(entryName) {
		return this.entries.find(e=>e.name === entryName)
	}
	this.getEntryByCode = function(eId) {
		return this.entries.find(e=>e.code === eId)
	}
	this.getIndexOfEntryByCode = function(eId) {
		for(const id in this.entries) if(this.entries[id].code === eId) return id
		return -1
	}

	/** {category: [tag1, tag2, ...], ...} */
	this.getTagsMap = function() {
		const tagsMap = {}

		for(const entry of this.entries) {
			for(const cat in entry.tags) {
				if(!(cat in tagsMap)) tagsMap[cat] = []
				for(const tag of entry.tags[cat]) if(tag && tagsMap[cat].indexOf(tag) < 0) tagsMap[cat].push(tag)
			}
		}
		return tagsMap
	}

	/**
	 * {
	 * 	byTag: {category: {tag: [eId1, eId2, ...], ...}, ...},
	 * 	byCategory: {category: [eId1, eId2, ...], ...}
	 * }
	 */
	this.getItemsByTag = function() {
		const out = {byTag: {}, byCategory:{}}
		for(const e of this.entries) {
			for(const cat in e.tags) {
				if(!(cat in out.byCategory)) {
					out.byTag[cat] = {}
					out.byCategory[cat] = []
				}
				for(const tag of e.tags[cat]) {
					if(!(tag in out.byTag[cat])) out.byTag[cat][tag] = []
					out.byTag[cat][tag].push(e.code)
					if(out.byCategory[cat].indexOf(e.code) < 0) out.byCategory[cat].push(e.code)
				}
			}
		}
		return out
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
	this.tags = {} // {category1: [tag1, ...], ...}
	this.lastVote = 0

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
		return {n: this.name, i: this.images, l:this.tags}
	}

	this.diffTags = function(entry2) {
		const diff = {}

		for(const cat in this.tags) {
			for(const tag of this.tags[cat]) {
				if(!(cat in entry2.tags) || entry2.tags[cat].indexOf(tag) < 0) {
					if(!(cat in diff)) {
						diff[cat] = []
					}
					diff[cat].push(tag)
				}
			}
		}

		return diff
	}
}
