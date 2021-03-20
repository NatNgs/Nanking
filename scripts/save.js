const MAX_DECAL = 6 // 2^6 = 64
const b64 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+-'
function nbset_add(nbset, add) {
	while(nbset.length*MAX_DECAL <= add) {
		nbset.push(0)
	}
	const rnk = (add/MAX_DECAL)|0
	nbset[rnk] |= 1<<(add - rnk*MAX_DECAL)

	return nbset
}
function nbset_toList(nbset) {
	const list = []
	for(let i=0; i<nbset.length; i++) {
		for(let j=0; j<MAX_DECAL; j++) {
			if(nbset[i] & 1<<j) list.push(i*MAX_DECAL+j)
		}
	}
	return list
}
function nbset_toListV1(nbcode) {
	if(!nbcode) return []
	const nbset = nbcode.split(' ')
	const list = []
	for(let i=0; i<nbset.length; i++) {
		for(let j=0; j<31; j++) {
			if(nbset[i] & 1<<j) list.push(i*31+j)
		}
	}
	return list
}
function nbset_toPrintableASCII(nbset) {
	return nbset.map(i=>b64[i]).reverse().join('')
}
function nbset_fromPrintableASCII(printable) {
	return !printable ? [] : printable.split('').reverse().map(c=>b64.indexOf(c))
}

function fromSavableV1(savable) {
	/* savable: {
		t: [tag1, tag2, ...],
		v: [...]
	*/
	const data = {votes:{}}

	for(const item of savable.v) {
		/* item: {
			n: 'name',
			i: [imgs],
			p: [vid1, vid2, ...], // ids of others items voted less preferred than this one
			m: [vid1, vid2, ...], // ids of others items votes preferred than this one
			e: [vid1, vid2, ...], // ids of others items voted same as this one
		}*/
		const vote = {
			imgs: item.i || [],
			votes: {},
		}

		for(const a2id of nbset_toListV1(item.p)) vote.votes[savable.v[a2id].n] = 1
		for(const a2id of nbset_toListV1(item.e)) vote.votes[savable.v[a2id].n] = 0
		for(const a2id of nbset_toListV1(item.m)) vote.votes[savable.v[a2id].n] = 2

		data.votes[item.n] = vote
	}

	/* {
		votes: {
			"name of a1": {
			imgs: ["http://.../.png", ...],
			votes: {
				"name of a2": 0/1/2 	// 1=>prefer a1; 2=>prefer a2
			},
		},
	}*/
	return data
}

function importFile() {
	const filesToLoad = document.getElementById("fileToImport")
	resetData()
	for(const fileToLoad of filesToLoad.files) {
		const reader = new FileReader()
		reader.onload = event => {
			loadData(event.target.result) // desired file content
			$('#fileToExport').attr('download', fileToLoad.name)
		}
		reader.onerror = error => {alert("Problem while reading the file."); console.log(error)}

		reader.readAsText(fileToLoad, "UTF-8")
		break
	}
}
function exportFile() {
	const strData = lzwEncodeJson({v:2, d:VOTE_SYSTEM.export()})
	const blob = new Blob([strData], {type: 'text/plain'})
	const link = document.getElementById('fileToExport')
	link.href = window.URL.createObjectURL(blob)
	link.click()
}
function loadData(rawdata) {
	try {
		data = lzwDecodeJson(rawdata)
	} catch(e) {
		console.error(e)
		alert("Error: Cannot read or decode file.")
		return
	}

	if(data && data.v===2) {
		VOTE_SYSTEM.import(data.d)
	} else if(data && data.l===1) {
		// Upgrade to version 2
		const v1Data = fromSavableV1(data)
		/* {
			votes: {
				"name of a1": {
				imgs: ["http://.../.png", ...],
				votes: {
					"name of a2": 0/1/2 	// 1=>prefer a1; 2=>prefer a2
				},
			},
		}*/
		for(const a1 in v1Data.votes) {
			const a1Data = v1Data.votes[a1]
			const e1 = VOTE_SYSTEM.entries.getOrCreateByName(a1)
			e1.images = a1Data.imgs
			for(const a2 in a1Data.votes) {
				const e2 = VOTE_SYSTEM.entries.getOrCreateByName(a2)
				VOTE_SYSTEM.castVote(e1.code, e2.code, (a1Data.votes[a2]===1?'p':(a1Data.votes[a2]===-1?'m':'e')))
			}
		}
	} else {
		alert("Error: Unexpected data format. Save file is either wrong, corrupted or from a more recent version of the tool.")
		return false
	}

	refreshTheQ()
}

function resetData() {
	if(!VOTE_SYSTEM.hasData() || confirm("Confirm reset data ?")) {
		VOTE_SYSTEM.reset()
		$('#fileToExport').attr('download', 'save.lzw')
	}
	refreshTheQ()
}
