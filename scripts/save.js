const MAX_DECAL = 31; // safe int from 2^0 to 2^30
function nbset_add(nbset, add) {
	while(nbset.length*MAX_DECAL <= add) {
		nbset.push(0);
	}
	const rnk = (add/MAX_DECAL)|0;
	nbset[rnk] |= 1<<(add - rnk*MAX_DECAL)

	return nbset;
}
function nbset_toList(nbcode) {
	if(!nbcode) return [];
	const nbset = nbcode.split(' ');
	const list = [];
	for(let i=0; i<nbset.length; i++) {
		for(let j=0; j<MAX_DECAL; j++) {
			if(nbset[i] & 1<<j) list.push(i*MAX_DECAL+j);
		}
	}
	return list;
}

function toSavable(data) {
	const vList = [];
	const savable = {t:[], v:[], l:1}; // l=1: savable version (need to increment each time new version is incompatible with previous)
	for(const a1Name of Object.keys(data.votes).sort().reverse()) {
		// a1Name: "name of a1"
		a1Data = data.votes[a1Name];
		/* a1Data: {
			imgs: ["http://.../.png", ...],
			video: "http://...",	// can be null
			tags: ["tag1", "tag2", ...],
			votes: {
				"name of a2": 0/1/2 	// 1=>prefer a1; 2=>prefer a2
			}
		}*/
		a1savable = {n: a1Name, p:[], m:[], e:[], t:[]};
		if(a1Data.imgs && a1Data.imgs.length) a1savable.i = a1Data.imgs.sort();
		if(a1Data.video) a1savable.v = a1Data.video;

		if(a1Data.votes) {
			for(const a2Name in a1Data.votes) {
				const index = vList.indexOf(a2Name);
				if(index < 0) { console.log(a2Name + ' NOT IN vLIST', vList); continue; }
				const vote = a1Data.votes[a2Name];
				if(vote === 0) nbset_add(a1savable.e, index);
				else if(vote === 1) nbset_add(a1savable.p, index);
				else if(vote === 2) nbset_add(a1savable.m, index);
				// else: invalid vote
			}
		}

		if(a1Data.tags && a1Data.tags.length) {
			for(const tag of a1Data.tags) {
				let index = savable.t.indexOf(tag);
				if(index < 0) {
					savable.t.push(tag);
					index = savable.t.length-1;
				}
				nbset_add(a1savable.t, index);
			}
			a1savable.t = a1savable.t.join(' ');
		} else delete a1savable.t;

		// remove empty lists
		if(a1savable.p.length < 0) delete a1savable.p;
		else a1savable.p = a1savable.p.join(' ');
		if(a1savable.m.length < 0) delete a1savable.m;
		else a1savable.m = a1savable.m.join(' ');
		if(a1savable.e.length < 0) delete a1savable.e;
		else a1savable.e = a1savable.e.join(' ');

		vList.push(a1Name);
		savable.v.push(a1savable);
	}

	/*
	{
		t: [tag1, tag2, ...],
		v: [{
			n: 'name',
			i: [imgs],
			t: [tid1, tid2, ...],
			p: [vid1, vid2, ...], // ids of others items voted less preferred than this one
			m: [vid1, vid2, ...], // ids of others items votes preferred than this one
			e: [vid1, vid2, ...], // ids of others items voted same as this one
		}, ...]
	*/
	return savable;
}
function fromSavable(savable) {
	/* savable: {
		t: [tag1, tag2, ...],
		v: [...]
	*/
	const data = {votes:{}};

	for(const item of savable.v) {
		/* item: {
			n: 'name',
			i: [imgs],
			t: [tid1, tid2, ...],
			p: [vid1, vid2, ...], // ids of others items voted less preferred than this one
			m: [vid1, vid2, ...], // ids of others items votes preferred than this one
			e: [vid1, vid2, ...], // ids of others items voted same as this one
		}*/
		const vote = {
			imgs: item.i || [],
			video: item.v || null,
			tags: nbset_toList(item.t).map(a=>savable.t[a]),
			votes: {},
		}

		for(const a2id of nbset_toList(item.p)) vote.votes[savable.v[a2id].n] = 1;
		for(const a2id of nbset_toList(item.e)) vote.votes[savable.v[a2id].n] = 0;
		for(const a2id of nbset_toList(item.m)) vote.votes[savable.v[a2id].n] = 2;

		data.votes[item.n] = vote;
	}

	/* {
		votes: {
			"name of a1": {
			imgs: ["http://.../.png", ...],
			video: "http://...",	// can be null
			tags: ["tag1", "tag2", ...],
			votes: {
				"name of a2": 0/1/2 	// 1=>prefer a1; 2=>prefer a2
			},
		},
	}*/
	return data;
}

function importFile() {
	const filesToLoad = document.getElementById("fileToImport")
	resetData()
	for(const fileToLoad of filesToLoad.files) {
		const reader = new FileReader()
		reader.onload = event => loadData(event.target.result) // desired file content
		reader.onerror = error => {alert("Problem while reading the file."); console.log(error)}

		reader.readAsText(fileToLoad, "UTF-8")
		break
	}
}
function exportFile() {
	const strData = lzwEncodeJson(toSavable(allData));
	const blob = new Blob([strData], {type: 'text/plain'});
	const link = document.getElementById('fileToExport');
	link.href = window.URL.createObjectURL(blob);
	link.click();
}
function loadData(rawdata) {
	try {
		data = lzwDecodeJson(rawdata);
	} catch(e) {
		console.error(e);
		alert("Error: Cannot read or decode file.");
		return;
	}
	if(data && data.l===1) {
		data = fromSavable(data);
	}
	if(!data || !data.votes) {
		alert("Wrong data format: no votes");
		return;
	}

	// Merging votes
	for(const v in data.votes) {
		const importData = data.votes[v];
		if(!allData.votes[v]) {
			allData.votes[v] = importData;
		} else {
			const vdata = allData.votes[v];
			// Merge imgs
			while(importData.imgs.length) {
				vdata.imgs.push(importData.imgs.pop());
			}
			vdata.imgs = Array.from(new Set(vdata.imgs)).sort(); // rm duplicates

			// Merge tags
			while(importData.tags.length) {
				vdata.tags.push(importData.tags.pop());
			}
			vdata.tags = Array.from(new Set(vdata.tags)).sort(); // rm duplicates

			// Merge votes
			for(const a in importData.votes) {
				if(!vdata.votes[a]) {
					vdata.votes[a] = importData.votes[a];
				}
			}
		}
	}

	refreshTheQ();
}

function resetData() {
	if(allData.hist.length <= 0 || confirm("Confirm reset data ?")) {
		allData.votes = {};
		allData.hist = [];
	}
	refreshTheQ();
}
