
function ScoreSystem(VOTE_SYSTEM) {
	const THIS = this

	/**
	 * {
	 *	"entries": {eId: {c: <Entry object>, k, d: {p, e, m, r, x, u, d, s, z}, i: {p, e, m, r, x, u, d, s, z}}, ...},
	 *	"tags": {category: {tag: {k, d: {p, e, m, r, x, u, d, s, z}, i: {p, e, m, r, x, u, d, s, z}}, ...}, ...}
	 * }
	 */
	this.scores = null
	this.lastScores = null;

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
	const calcDirectEntryScores = function(itemScores) {
		const outMap = {}
		const k = Object.entries(itemScores).length -1

		for(const eId in itemScores) {
			const item = itemScores[eId]
			outMap[eId] = calcS({
				c: item.c,
				p: item.p.length,
				e: item.e.length,
				m: item.m.length,
				k: k,
			})
		}

		return outMap
	}

	/** returns {category: {tag: {entries:[eId1, eId2,...], p, e, m, k, x, u, d, s}, ..}, ..} */
	const calcDirectTagScores = function(voteMap) {
		const tagsScores = {} // {category: {tag: {p,e,m,k,x,u,d,s}, ..}, ..}

		/* {
		 * 	byTag: {category: {tag: [eId1, eId2, ...], ...}, ...},
		 * 	byCategory: {category: [eId1, eId2, ...], ...}
		 * }
		 */
		const categoryItemList = VOTE_SYSTEM.entries.getItemsByTag()

		for(const category in categoryItemList.byTag) {
			// Build tagsGroups in
			const allInCategory = categoryItemList.byCategory[category]

			tagsScores[category] = {}
			for(const tag in categoryItemList.byTag[category]) {
				const groupIn = categoryItemList.byTag[category][tag]

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

	this.refreshScoresDirect = function(directVotesMap) {
		THIS.lastScores = THIS.scores
		THIS.scores = {entries:{}, tags:{}}

		const directEntryScores = calcDirectEntryScores(directVotesMap)
		for(const eId in directEntryScores) {
			const c = directEntryScores[eId].c
			const k = directEntryScores[eId].k
			THIS.scores.entries[eId] = {
				c: c,
				k: k,
				d: directEntryScores[eId],
				i: directEntryScores[eId],
			}
		}

		const directTagsScores = calcDirectTagScores(directVotesMap)
		for(const cat in directTagsScores) {
			THIS.scores.tags[cat] = {}
			for(const tag in directTagsScores[cat]) {
				const k = directTagsScores[cat][tag].k
				THIS.scores.tags[cat][tag] = {
					k: k,
					d: directTagsScores[cat][tag],
					i: directTagsScores[cat][tag],
				}
			}
		}

		setTimeout(()=>{
			for(const eId in directEntryScores) {
				delete directEntryScores[eId].c
				delete directEntryScores[eId].k
			}
			for(const cat in directTagsScores) {
				for(const tag in directTagsScores[cat]) {
					delete directTagsScores[cat][tag].entries
					delete directTagsScores[cat][tag].k
				}
			}
		}, 100)
	}

	this.refreshScoresIndirect = function(directVotesMap) {
		const indirectVotesMap = VOTE_SYSTEM.getFullIndirectVotesMap(directVotesMap)

		const indirectEntryScores = calcDirectEntryScores(indirectVotesMap)
		for(const eId in indirectEntryScores) {
			THIS.scores.entries[eId].i = indirectEntryScores[eId]
		}

		const indirectTagsScores = calcDirectTagScores(indirectVotesMap)
		for(const cat in indirectTagsScores) {
			for(const tag in indirectTagsScores[cat]) {
				THIS.scores.tags[cat][tag].i = indirectTagsScores[cat][tag]
			}
		}

		setTimeout(()=>{
			for(const eId in indirectEntryScores) {
				delete indirectEntryScores[eId].c
				delete indirectEntryScores[eId].k
			}
			for(const cat in indirectTagsScores) {
				for(const tag in indirectTagsScores[cat]) {
					delete indirectTagsScores[cat][tag].entries
					delete indirectTagsScores[cat][tag].k
				}
			}
		})
	}
}
