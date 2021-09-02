
function ScoreSystem(VOTE_SYSTEM) {
	const THIS = this

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

		if(!a.k) {
			a.x = 0
			a.u = 1
			a.d = 0
		} else {
			a.x = a.r/a.k
			a.u = (1+(a.p+a.k-a.r)/a.k-a.m/a.k)/2
			a.d = (1+a.p/a.k-(a.m+a.k-a.r)/a.k)/2
		}
		a.z = a.s = (a.u+a.d)/2

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
		let a = new Date()
		const voteList = VOTE_SYSTEM.getFullVotesList() // [{c: <Entry object>, p:[], e:[], m:[]}, ...]
		const tagsMap = VOTE_SYSTEM.entries.getTagsMap() // {categoryName: [tag1, tag2, ...], ...}
		const tagsScores = {} // {category: {tag: {p,e,m,k,x,u,d,s}, ..}, ..}

		const voteMap = {}
		for(const data of voteList) voteMap[data.c.code] = data

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

				// group votes
				let p = 0
				let e = 0
				let m = 0
				for(const cOut of allInCategory) {
					if(groupIn.indexOf(cOut) < 0) {
						for(const cIn of groupIn) {
							const item = voteMap[cIn]
							if(item.p.indexOf(cOut) >= 0) p++
							else if(item.e.indexOf(cOut) >= 0) e++
							else if(item.m.indexOf(cOut) >= 0) m++
						}
					}
				}
				tagsScores[category][tag] = calcS({p, e, m, k: groupIn.length * (allInCategory.length - groupIn.length), entries: groupIn})
			}
		}

		return tagsScores
	}

	this.zLoops = 64
	const calcFullScoring = function() {
		const entryScores = calcDirectEntryScores()
		const tagsScores = calcDirectTagScores()

		for(let loop = THIS.zLoops; loop > 0; loop--) {
			// Modulate entry scores using tags scores
			for(const eId in entryScores) {
				const entryData = entryScores[eId]
				const entry = entryData.c

				let sum = 0
				let weight = 0
				for(const category in entry.tags) {
					for(const tag of entry.tags[category]) {
						const s = tagsScores[category][tag].s
						const x = tagsScores[category][tag].x
						sum += s*x
						weight += x
					}
				}
				entryData.s = ((weight>0)?(sum/weight):.5)*(entryData.u-entryData.d) + entryData.d
			}

			// Modulate tags scores using entryScores
			for(const category in tagsScores) {
				for(const tag in tagsScores[category]) {
					const tagData = tagsScores[category][tag]

					let sum = 0
					let weight = 0
					for(const eId of tagData.entries) {
						const s = entryScores[eId].s
						const x = entryScores[eId].x
						sum += s*x
						weight += x
					}
					tagData.s = ((weight>0)?(sum/weight):.5)*(tagData.u-tagData.d) + tagData.d
				}
			}
		}

		return {entries: entryScores, tags: tagsScores}
	}

	this.refreshScores = function() {
		THIS.scores = calcFullScoring()
	}
}
