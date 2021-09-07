
function ScoreSystem(VOTE_SYSTEM) {
	const THIS = this

	/**
	 * {
	 *	"entries": {eId: {n, k, dp, de, dm, ip, ie, im}, ...},
	 *	"tags": {cat: {tag: {n, k, dp, de, dm, ip, ie, im}, ...}, ...}
	 * }
	 */
	let scoremap = {entries:{}, tags:{}}

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
	const calcS = function(a, k) {
		a.r = a.p + a.e + a.m

		if(!k) {
			a.x = 0
			a.u = 1
			a.d = 0
		} else {
			a.x = a.r/k
			a.u = (1+(a.p+k-a.r)/k-a.m/k)/2
			a.d = (1+a.p/k-(a.m+k-a.r)/k)/2
		}
		a.z = a.s = (a.u+a.d)/2

		return a
	}


	const initScores = function() {
		const directVotesMap = VOTE_SYSTEM.getFullDirectVotesMap()
		const indirectVotesMap = VOTE_SYSTEM.getFullIndirectVotesMap(directVotesMap)

		// Initiate Tags Scores
		const tagsMap = VOTE_SYSTEM.entries.getItemsByTag()
		for(const cat in tagsMap.byTag) {
			scoremap.tags[cat] = {}
			for(const tag in tagsMap.byTag[cat]) {
				scoremap.tags[cat][tag] = {
					cat: tagsMap.byCategory[cat], // list of eId that have any tag of the category
					tag: tagsMap.byTag[cat][tag], // list of eId that have the tag
					dp: [], // [eId1:eId2, eId1:eId3, ..., eId4:eId5, ...]
					de: [],
					dm: [],
					ip: [],
					ie: [],
					im: [],
				}
			}
		}

		// Calculate Entry Scores & Tags scores
		const k = Object.entries(directVotesMap).length -1
		for(const eId1 in directVotesMap) {
			const direct = directVotesMap[eId1]
			const indirect = indirectVotesMap[eId1]

			// Init Entry scores
			scoremap.entries[eId1] = {
				k: k,
				n: direct.entry.name,
				dp: direct.p,
				de: direct.e,
				dm: direct.m,
				ip: indirect.p,
				ie: indirect.e,
				im: indirect.m,
			}

			// Init Tag scores
			for(const type of ['dp', 'de', 'dm', 'ip', 'ie', 'im']) {
				for(const eId2 of scoremap.entries[eId1][type]) {
					const diffTags = direct.entry.diffTags(directVotesMap[eId2].entry)
					for(const cat in diffTags) for(const tag of diffTags[cat]) {
						scoremap.tags[cat][tag][type].push(eId1 + ':' + eId2)
					}
				}
			}
		}
	}

	const finalizeScoring = function() {
		// Entries
		for(const eId in scoremap.entries) {
			const data = scoremap.entries[eId]
			THIS.scores.entries[eId] = {
				n: data.n,
				k: data.k,
				d: calcS({
					p: data.dp.length,
					e: data.de.length,
					m: data.dm.length,
				}, data.k),
				i: calcS({
					p: data.ip.length,
					e: data.ie.length,
					m: data.im.length,
				}, data.k)
			}
		}

		// Tags
		for(const cat in scoremap.tags) {
			THIS.scores.tags[cat] = {}
			for(const tag in scoremap.tags[cat]) {
				const data = scoremap.tags[cat][tag]
				const k = data.tag.length * (data.cat.length-data.tag.length)
				THIS.scores.tags[cat][tag] = {
					n: tag,
					k: k,
					d: calcS({
						p: data.dp.length,
						e: data.de.length,
						m: data.dm.length,
					}, k),
					i: calcS({
						p: data.ip.length,
						e: data.ie.length,
						m: data.im.length,
					}, k)
				}
			}
		}
	}

	this.refreshScores = function(...eIdToUpdate) {
		this.lastScores = this.scores
		//if(!this.lastScores || eIdToUpdate.length <= 0) {
		this.scores = {entries:{}, tags:{}}
		initScores()
		/*} else {
			this.scores = JSON.stringify(JSON.parse(this.lastScores))
			updateScores(eIdToUpdate)
		}*/
		finalizeScoring()
	}
}
