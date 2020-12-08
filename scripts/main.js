const allData = {
	votes: {
		/*
		"name of a1": {
			imgs: ["http://.../.png", ...],
			video: "http://...",	// can be null
			tags: ["tag1", "tag2", ...],
			votes: {
				"name of a2": 0/1/2 	// 1=>prefer a1; 2=>prefer a2
			}
		},
		*/
	},
	history: [
		/*	{a1: "name of a1", a2: "name of a2", v: 0/1/2}, ...  (First is oldest, Last is most recent) */
	],
};
let scores = [
	// {n: "name of a", p: 42, e: 53, m: 28}  // n:name  p:plus  e:equal  m:minus
];
let tags = [
	// {n: "tag", p: 42, e: 53, m: 28}	 // n:tag  p:plus  e:equal  m:minus
];

function init() {
	refreshTheQ();
}

function importFile() {
	const fileToLoad = document.getElementById("fileToImport").files[0];

	const reader = new FileReader()
	reader.onload = event => loadData(event.target.result) // desired file content
	reader.onerror = error => alert("Problem while reading the file.")
	
	reader.readAsText(fileToLoad, "UTF-8");
}
function exportFile() {
	const strData = lzwEncodeJson(allData);
	const blob = new Blob([strData], {type: 'text/plain'});
	const link = document.getElementById('fileToExport');
	link.href = window.URL.createObjectURL(blob);
	link.click();
}
function loadData(data) {
	try { 
		data = lzwDecodeJson(data); 
	} catch(e) { 
		console.error(e);
		alert("Error: Cannot read or decode file."); 
		return;
	}
	if(!data || !data.votes || !data.history) {
		alert("Wrong data format: no votes or no history");
		return;
	}
	
	// Merging history
	while(data.history.length) {
		allData.history.unshift(data.history.pop());
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

	refreshList();
	alert("Loaded !");
}
function resetData() {
	if(!history.length || confirm("Confirm reset data ?")) {
		allData.votes = {};
		allData.history = [];
	}
	refreshList();
}

function addNewEntry() {
	const nEntr = document.getElementById('newEntry').value;
	if(!nEntr) {
		alert("Please fill new entry name");
		return;
	}
	if(allData.votes[nEntr]) {
		return updateEntry(nEntr);
	}
	allData.votes[nEntr] = {
		imgs: [],
		tags: [],
		votes: {}
	}
	refreshList();
	updateEntry(nEntr);
}
function updateEntry(entryName) {
	const dial = $("#dialog-updateEntry");

	// Get data
	const entry = allData.votes[entryName];
	const newTags = {}; // {<tag>: true/false}
	const newImgs = {}; // {<imgUrl>: true/false}
	
	function showTag(divTags, tag) {
		const newDiv = $('<li name="'+ tag +'">'+ tag +'<button class="cross"/></li>');
		divTags.append(newDiv);
		divTags.append($('li', divTags).sort((a, b)=>$(a).attr('name')>$(b).attr('name')?1:-1));
		$('.cross', newDiv).click(()=>{
			newTags[tag] = false;
			$('*[name="'+ tag +'"]', divTags).remove();
		});
	}
	function showImg(divImgs, imgUrl) {
		const newDiv = $('<li name="'+ imgUrl +'"><img src="'+ imgUrl +'"/><button class="cross"/></li>');
		divImgs.append(newDiv);
		$('.cross', newDiv).click(()=>{
			newImgs[imgUrl] = false;
			$('*[name="'+ imgUrl +'"]', divImgs).remove();
		});
	}
	
	// Update dialog content
	const divTags = $("#updateEntry-tags").empty();
	const divImgs = $("#updateEntry-imgs").empty();
	for(const tag of entry.tags) {
		newTags[tag] = true;
		showTag(divTags, tag);
	}
	for(const img of entry.imgs) {
		newImgs[img] = true;
		showImg(divImgs, img);
	}

	const tagInpt = $("#updateEntry-newTagInpt").val("");
	$("#updateEntry-newTag").unbind("click").click(()=>{
		const val = tagInpt.val().toLowerCase();
		if(val && !newTags[val]) {
			newTags[val] = true;
			showTag(divTags, val);
			tagInpt.val("");
		}
	});

	const imgInpt = $("#updateEntry-newImgInpt").val("");
	$("#updateEntry-newImg").unbind("click").click(()=>{
		const val = imgInpt.val();
		if(val && !newImgs[val]) {
			testImage(val, ()=>{ // On Success
				newImgs[val] = true;
				showImg(divImgs, val);
				imgInpt.val("");
			}, ()=>{ // On Error
				alert("Error: Cannot show image at this url (Timeout after 2.5s)");
			}, 2500);
		}
	});

	const nameInpt = $("#updateEntry-name").val(entryName);

	// Autocomplete tags
	$("#updateEntry-newTagInpt").autocomplete({source: tags.map(a=>a.n).sort()});

	// Show dialog
	dial.dialog({
		title: 'Update item',
		width: 'auto',
		buttons: {
			"Delete /!\\": function() {
				// Remove entry
				delete allData.votes[entryName];

				// Remove votes
				for(const d in allData.votes) {
					if(entryName in allData.votes[d].votes) {
						delete allData.votes[d].votes[entryName];
					}
				}

				dial.dialog("close");
				refreshTheQ();
			},
			"Confirm": function() {
				// Check new entry name
				const newEntryName = nameInpt.val().trim();
				if(!newEntryName) {
					alert("Value is blank");
					return;
				}
				if(newEntryName !== entryName && allData.votes[newEntryName]) {
					alert("Another item already have this name");
					return;
				}

				// Rename entry
				allData.votes[newEntryName] = allData.votes[entryName];
				delete allData.votes[entryName];

				// Rename votes
				for(const d in allData.votes) {
					if(entryName in allData.votes[d].votes) {
						allData.votes[d].votes[newEntryName] = allData.votes[d].votes[entryName];
						delete allData.votes[d].votes[entryName];
					}
				}

				// Update Entry lists
				entry.tags = Object.keys(newTags).filter(a=>newTags[a]).sort();
				entry.imgs = Object.keys(newImgs).filter(a=>newImgs[a]).sort();

				dial.dialog("close");
				refreshTheQ();
			},
			"Reset": function() {
				updateEntry(entryName);
			},
			"Cancel": function() {
				dial.dialog( "close" );
			}
		}
	});
}

function testImage(url, onSuccess, onError, timeout = 1000) {
	let timedOut = false, timer;
	const img = new Image();
	img.onerror = img.onabort = function() {
		if (!timedOut) {
			clearTimeout(timer);
			onError(url, "error");
		}
	};
	img.onload = function() {
		if (!timedOut) {
			clearTimeout(timer);
			onSuccess(url, "success");
		}
	};
	img.src = url;
	timer = setTimeout(function() {
		timedOut = true;
		img.src = "//!!!!/test.jpg"; // reset .src to invalid URL so it stops previous
		onError(url, "timeout");
	}, timeout); 
}

function calcS(a) {
	const r=a.p+a.e+a.m;
	if(!r) {
		a.s = -1;
		return a;
	}
	a.s = (1+a.p/r-a.m/r)/2
	return a;
}
function pemSort(a,b) {
	return a.s<b.s?1:(a.s===b.s&&a.n<b.n?1:-1); // sort by 1:score; 2:alphabetically
}
function refreshScores() {
	// Recompute scores
	while(scores.length) scores.pop();
	while(tags.length) tags.pop();

	const tmpScores = {};
	const tmpTags = {};
	const allAKeys = Object.keys(allData.votes).sort().reverse(); // reverse order needed
	for(const a1 of allAKeys) {
		const adv = allData.votes[a1];
		tmpScores[a1] = {n: a1, p:0, e:0, m:0, t:1}; // init score

		for(const a2 in adv.votes) {
			const vote = adv.votes[a2];
			if(a2 <= a1) {
				// data is wrong; check if data exists in a2, move it if not; then remove it
				if(!allData.votes[a2].votes[a1]) {
					allData.votes[a2].votes[a1] = vote;
				}
				delete adv.votes[a2];
			} else {
				switch(vote) {
				case 0:
					tmpScores[a1].e ++;
					tmpScores[a2].e ++; // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order
					break;
				case 1:
					tmpScores[a1].p ++;
					tmpScores[a2].m ++; // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order
					break;
				case 2:
					tmpScores[a1].m ++;
					tmpScores[a2].p ++; // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order
					break;
				default:
					// data is wrong, removing the vote data and ignoring it
					delete adv.votes[a2];
				}
			}
		}
	}

	for(const a of allAKeys) {
		const tags = allData.votes[a].tags;
		for(const t of tags) {
			if(!tmpTags[t]) tmpTags[t] = {n: t, p:0, e:0, m:0, t:0}; // init tag if not exist
			tmpTags[t].p += tmpScores[a].p;
			tmpTags[t].e += tmpScores[a].e;
			tmpTags[t].m += tmpScores[a].m;
			tmpTags[t].t ++;
		}
	}

	// Convert tmpScores & tmpTags maps => scores & tags ordered lists
	scores = Object.values(tmpScores).map(calcS).sort(pemSort);
	tags = Object.values(tmpTags).map(calcS).sort(pemSort);
}
function refreshList() {
	refreshScores();

	function build(theList) {
		let htmlContent = '';
		let pts = 101, arnk = -1;
		for(const rnk in theList) {
			const a = theList[rnk];
			const r = a.p + a.e + a.m;
			const rmax = a.t*(scores.length-1);
			const t = r <= 0 ? 0 : 1/r;
			if(a.s < 0) {
				arnk = '-';
				pts = 0;
			} else if(pts > a.s) {
				pts = a.s;
				arnk = (rnk|0)+1;
			}

			htmlContent += `<div class="listE">
	<div class="coll">
		<div class="rnk">${arnk}. </div>
		<div class="name">${a.n}</div>
		<button class="imgBtn" onclick="updateEntry(\'${a.n}\')"></button>
	</div>
	<div class="coll">
		<span class="sc" style="background-color: rgba(255,255,63,${pts*.9+.1});">${pts==='-'?'-':(pts*100)|0}</span>
		<span class="p" style="background-color: rgba(63,255,63,${t*a.p*.9+.1});">+${Math.round(100*t*a.p)}%</span>
		<span class="e" style="background-color: rgba(255,196,63,${t*a.e*.9+.1});">=${Math.round(100*t*a.e)}%</span>
		<span class="m" style="background-color: rgba(255,63,63,${t*a.m*.9+.1});">-${Math.round(100*t*a.m)}%</span>
		<span class="rep" style="background-color: rgba(63,255,255,${(r*r)/(rmax*rmax)});">/${(100*r/rmax)|0}% (${r}/${rmax})</span>
	</div>
</div>`;
		}
		return htmlContent;
	}

	document.getElementById('listItems').innerHTML = build(scores);
	document.getElementById('listTags').innerHTML = build(tags);
}

function pick2() {
	let a, b, an, bn;
	let i=0, max = scores.length;
	do {
		// Select random pair
		a = (Math.random()*scores.length)|0;
		b = ((a-Math.random()*(scores.length-1)+scores.length)|0)%scores.length;
		
		an = scores[a].n;
		bn = scores[b].n;
	} while((i++)<=max && ((an<bn?bn:an) in allData.votes[an<bn?an:bn].votes));

	return [a, b];
}
function refreshTheQ() {
	refreshList();

	if(scores.length < 2) {
		document.getElementById('theQ').classList.add("toHide");
		document.getElementById('theQErr').classList.remove("toHide");
	} else {
		document.getElementById('theQErr').classList.add("toHide");
		document.getElementById('theQ').classList.remove("toHide");

		const [ia, ib] = pick2();

		const a = scores[ia].n;
		const b = scores[ib].n;

		// Fill voting panel
		$('#a1 .title').text(a);
		$('#a2 .title').text(b);

		const pa1 = allData.votes[a].imgs;
		const pa2 = allData.votes[b].imgs;
		$('#a1 img').attr('src', 'pict/loading.svg'); // force
		$('#a2 img').attr('src', 'pict/loading.svg'); // force
		
		setTimeout(()=>{
			$('#a1 img').attr('src', pa1.length ? pa1[(Math.random()*pa1.length)|0] : 'pict/unknown.svg');
			$('#a2 img').attr('src', pa2.length ? pa2[(Math.random()*pa2.length)|0] : 'pict/unknown.svg');
		}, 100);

		$('#a0 #bSame').attr("onclick", "").unbind("click").click(()=>theQ(a, b, 0));
		$('#a0 #bCant').attr("onclick", "").unbind("click").click(()=>theQ(a, b, -1));
		$('#a1 button').attr("onclick", "").unbind("click").click(()=>theQ(a, b, 1));
		$('#a2 button').attr("onclick", "").unbind("click").click(()=>theQ(a, b, 2));
	}
}

function theQ(ia1, ia2, vote) {
	const a = (ia1<ia2?ia1:ia2);
	const b = (ia1<ia2?ia2:ia1);
		
	// vote: -1=Unset; 0=No pref; 1=Pref 1; 2=Pref 2
	if(vote === 0 || vote === 1 || vote === 2) {
		const a1 = allData.votes[a];
		a1.votes[b] = (vote<=0?0: (ia1<ia2?vote:vote%2+1));
	} else {
		const a1 = allData.votes[a];
		delete a1.votes[b];
	}
	allData.history.push({a1: ia1, a2: ia2, v: vote});
	while(allData.history.length > (scores.length * (scores.length-1)/2)) {
		allData.history.shift();
	}

	refreshTheQ();
}
