
function ScoreSystem(VOTE_SYSTEM) {
	/**
	 * {
	 *	"entries": {eId: {c: <Entry object>, p, e, m, k, r, x, u, d, s, z}, ...},
	 *	"tags": {category: {tag: {entries:[eId1, eId2,...], p, e, m, k, x, u, d, s, z}, ..}, ..}
	 * }
	 */
	this.scores = null

	/**
	 * Parameters:
	 *	a.p: nb of + votes
	 *	a.e: nb of = votes
	 *	a.m: nb of - votes
	 *	a.k: max votes possible to cast
	 * Output:
	 *	a.r: number of casted votes
	 *	a.x: % casted votes over max possible
	 *	a.u: score such as all uncasted votes are in favor
	 *	a.d: score such as all uncasted votes are against
	 *	a.z: average score
	 *	a.s: score (same as average score, to be overriden by calcFullScoring)
	*/
	const calcS = function(a) {
		a.r = a.p + a.e + a.m

		if(!a.r || !a.k) {
			a.x = 0
			a.u = 1
			a.d = 0
			a.s = .5
		} else {
			a.x = a.r/a.k
			a.u = (1+(a.p+a.k-a.r)/a.k-a.m/a.k)/2
			a.d = (1+a.p/a.k-(a.m+a.k-a.r)/a.k)/2
			a.s = (a.u+a.d)/2
		}
		a.z = a.s

		return a
	}

	/** returns {eId: {c: <Entry object>, p, e, m, k, r, x, u, d, s}, ...} */
	const calcDirectEntryScores = function() {
		// itemScores: [{c: <Entry object>, p:[], e:[], m:[]}, ...]
		const itemScores = VOTE_SYSTEM.getFullVotesList()
		const outMap = {}

		for(const item of itemScores) {
			outMap[item.c.code] = calcS({
				c: item.c,
				p: item.p.length,
				e: item.e.length,
				m: item.m.length,
				k: itemScores.length-1,
			})
		}

		return outMap
	}

	/** returns {category: {tag: {entries:[eId1, eId2,...], p, e, m, k, x, u, d, s}, ..}, ..} */
	const calcDirectTagScores = function() {
		const voteList = VOTE_SYSTEM.getFullVotesList() // [{c: <Entry object>, p:[], e:[], m:[]}, ...]
		const tagsMap = VOTE_SYSTEM.entries.getTagsList() // {categoryName: [tag1, tag2, ...], ...}
		const tagsScores = {} // {category: {tag: {p,e,m,k,x,u,d,s}, ..}, ..}

		for(const category in tagsMap) {
			const tagsGroupsIn = {}

			// Build tagsGroups in
			const allInCategory = []
			for(const tag of tagsMap[category]) {
				tagsGroupsIn[tag] = VOTE_SYSTEM.entries.getItemsByTag(category, tag)
				for(const item of tagsGroupsIn[tag]) {
					if(allInCategory.indexOf(item) < 0) allInCategory.push(item)
				}
			}

			tagsScores[category] = {}
			for(const tag of tagsMap[category]) {
				const groupIn = tagsGroupsIn[tag]

				// Build tagsGroups out
				const out = allInCategory.filter((cIn)=>groupIn.indexOf(cIn) < 0)

				// group votes
				let p = 0
				let e = 0
				let m = 0
				for(const item of voteList) {
					if(groupIn.indexOf(item.c.code) >= 0) {
						p += item.p.filter(c=>out.indexOf(c) >= 0).length
						e += item.e.filter(c=>out.indexOf(c) >= 0).length
						m += item.m.filter(c=>out.indexOf(c) >= 0).length
					}
				}
				tagsScores[category][tag] = calcS({p, e, m, k: groupIn.length * out.length, entries: groupIn})
			}
		}

		return tagsScores
	}

	this.zLoops = 64
	const calcFullScoring = function() {
		const entryScores = calcDirectEntryScores()
		const tagsScores = calcDirectTagScores()

		for(let loop = this.zLoops; loop > 0; loop--) {
			// Modulate entry scores using tags scores
			for(const eId in entryScores) {
				const entryData = entryScores[eId]
				const entry = entryData.c

				let sum = (entryData.s * entryData.x)
				let weight = entryData.x
				for(const category in entry.tags) {
					for(const tag of entry.tags[category]) {
						const s = tagsScores[category][tag].s
						const x = tagsScores[category][tag].x
						sum += s*x
						weight += x
					}
				}
				entryData.s = (weight>0)?(sum/weight):entryData.s
			}

			// Modulate tags scores using entryScores
			for(const category in tagsScores) {
				for(const tag in tagsScores[category]) {
					const tagData = tagsScores[category][tag]

					let sum = (entryData.s * entryData.x)
					let weight = entryData.x
					for(const eId of tagData.entries) {
						const s = entryScores[eId].s
						const x = entryScores[eId].x
						sum += s*x
						weight += x
					}
					tagData.s = (weight>0)?(sum/weight):entryData.s
				}
			}
		}

		return {entries: entryScores, tags: tagsScores}
	}

	this.refreshScores = function() {
		this.scores = calcFullScoring()
	}
}
