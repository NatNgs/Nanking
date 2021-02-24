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
	hist: [
		/*	"name of a1", "name of a2", ...  (First is oldest, Last is most recent) */
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

	refreshList();
	alert("Loaded !");
}
function resetData() {
	if(confirm("Confirm reset data ?")) {
		allData.votes = {};
		allData.hist = [];
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
				if(newEntryName !== entryName) {
					allData.votes[newEntryName] = allData.votes[entryName];
					delete allData.votes[entryName];

					// Rename votes
					for(const d in allData.votes) {
						if(entryName in allData.votes[d].votes) {
							allData.votes[d].votes[newEntryName] = allData.votes[d].votes[entryName];
							delete allData.votes[d].votes[entryName];
						}
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

	a.x = r/a.k; // % casted votes
	if(!r) {
		a.s = -1;
		return a;
	}
	a.u = (1+(a.p+a.k-r)/a.k-a.m/a.k)/2; // score such as all uncasted votes are in favor
	a.d = (1+a.p/a.k-(a.m+a.k-r)/a.k)/2; // score such as all uncasted votes are against
	a.s = (a.u+a.d)/2; // score
	return a;
}
function pemSort(a,b) {
	return (a.s<b.s?1 // sort by 1:score
		:(a.s>b.s?-1
		:(a.x>b.x?1 // 2: rep (% of casted votes)
		:(a.x<b.x?-1
		:(a.n<b.n?1 // 3: alphabetically
		:-1)))));
}
function refreshScores() {
	// Recompute scores
	while(scores.length) scores.pop();
	while(tags.length) tags.pop();

	const tmpScores = {};
	const tmpTags = {};
	const allAKeys = Object.keys(allData.votes).sort().reverse(); // reverse order needed
	for(const a1 of allAKeys) {
		const adv1 = allData.votes[a1];
		tmpScores[a1] = {n: a1, p:0, e:0, m:0, t:1}; // init score

		for(const a2 in adv1.votes) {
			const adv2 = allData.votes[a2];
			const vote = adv1.votes[a2];
			if(!adv2 || a2 <= a1) {
				delete adv1.votes[a2]; // vote is wrong: remove it
			} else {
				switch(vote) {
				case 0:
					// Update elem score
					tmpScores[a1].e ++;
					tmpScores[a2].e ++; // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order

					// Update tags score
					for(const t1 of adv1.tags) {
						if(adv2.tags.indexOf(t1)<0) {
							if(!tmpTags[t1]) tmpTags[t1] = {n: t1, p:0, e:0, m:0, t:0}; // init tag if not exist
							tmpTags[t1].e++;
						}
					}
					for(const t2 of adv2.tags) {
						if(adv1.tags.indexOf(t2)<0) {
							if(!tmpTags[t2]) tmpTags[t2] = {n: t2, p:0, e:0, m:0, t:0}; // init tag if not exist
							tmpTags[t2].e++;
						}
					}

					break;
				case 1:
					// Update elem score
					tmpScores[a1].p ++;
					tmpScores[a2].m ++; // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order

					// Update tags score
					for(const t1 of adv1.tags) {
						if(adv2.tags.indexOf(t1)<0) {
							if(!tmpTags[t1]) tmpTags[t1] = {n: t1, p:0, e:0, m:0, t:0}; // init tag if not exist
							tmpTags[t1].p++;
						}
					}
					for(const t2 of adv2.tags) {
						if(adv1.tags.indexOf(t2)<0) {
							if(!tmpTags[t2]) tmpTags[t2] = {n: t2, p:0, e:0, m:0, t:0}; // init tag if not exist
							tmpTags[t2].m++;
						}
					}

					break;
				case 2:
					// Update elem score
					tmpScores[a1].m ++;
					tmpScores[a2].p ++; // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order
					
					// Update tags score
					for(const t1 of adv1.tags) {
						if(adv2.tags.indexOf(t1)<0) {
							if(!tmpTags[t1]) tmpTags[t1] = {n: t1, p:0, e:0, m:0, t:0}; // init tag if not exist
							tmpTags[t1].m++;
						}
					}
					for(const t2 of adv2.tags) {
						if(adv1.tags.indexOf(t2)<0) {
							if(!tmpTags[t2]) tmpTags[t2] = {n: t2, p:0, e:0, m:0, t:0}; // init tag if not exist
							tmpTags[t2].p++;
						}
					}

					break;
				default:
					// data is wrong, removing the vote data and ignoring it
					delete adv1.votes[a2];
				}
			}
		}
	}

	for(const a of allAKeys) {
		const tags = allData.votes[a].tags;
		for(const t of tags) {
			if(!tmpTags[t]) tmpTags[t] = {n: t, p:0, e:0, m:0, t:0}; // init tag if not exist
			tmpTags[t].t ++; // number of time this tag has been presented
		}
	}

	// Convert tmpScores & tmpTags maps => scores & tags ordered lists
	let scoresList = Object.values(tmpScores);
	let calcK = (a)=>{a.k=a.t*(scoresList.length-a.t); return a;}; // k=max votes to be casted
	scores = Object.values(tmpScores).map(calcK).map(calcS).sort(pemSort);
	tags = Object.values(tmpTags).map(calcK).map(calcS).sort(pemSort);
}
function refreshList() {
	refreshScores();

	function build(theList) {
		let htmlContent = '';
		let pts = 101, arnk = -1;
		for(const rnk in theList) {
			const a = theList[rnk];
			const r = a.p + a.e + a.m;
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
		<div class="rnk">${arnk}.&nbsp;</div>
		<div class="name">${a.n}</div>
		<button class="imgBtn" onclick="updateEntry(\'${a.n}\')"></button>
	</div>
	<div class="coll">
		<span class="sc" style="background-color: rgba(255,255,63,${pts*.9+.1});">`;
		
			if(pts==='-') {
				htmlContent+='-';
			} else {
				htmlContent += `<span>${(100*a.d)|0}&nbsp;-&nbsp;</span><span class="ctr">${(100*a.s).toFixed(1)}</span><span>&nbsp;-&nbsp;${(100*a.u)|0}</span>`
			}
			htmlContent += `</span>
		<span class="p" style="background-color: rgba(63,255,63,${t*a.p*.9+.1});">+${Math.round(100*t*a.p)}%</span>
		<span class="e" style="background-color: rgba(255,196,63,${t*a.e*.9+.1});">=${Math.round(100*t*a.e)}%</span>
		<span class="m" style="background-color: rgba(255,63,63,${t*a.m*.9+.1});">-${Math.round(100*t*a.m)}%</span>
		<span class="rep" style="background-color: rgba(63,255,255,${a.x});">/${(100*a.x)|0}% (${r}/${a.k})</span>
	</div>
</div>`;
		}
		return htmlContent;
	}

	document.getElementById('listItems').innerHTML = build(scores);
	document.getElementById('listTags').innerHTML = build(tags);
}

function pick2() {
	let an, bn;
	const filteredList = Object.keys(allData.votes).filter(a=>allData.hist.indexOf(a)<0);
	for(let i=filteredList.length; i>0; i--) {
		// Select random pair
		const a = (Math.random()*filteredList.length)|0;
		const b = ((a-Math.random()*(filteredList.length-1)+filteredList.length)|0)%filteredList.length;
		
		an = filteredList[a];
		bn = filteredList[b];
		
		if(!((an<bn?bn:an) in allData.votes[an<bn?an:bn].votes)) break;
	}

	return [an, bn];
}
function refreshTheQ() {
	refreshList();

	if(scores.length < 2) {
		document.getElementById('theQ').classList.add("toHide");
		document.getElementById('theQErr').classList.remove("toHide");
	} else {
		document.getElementById('theQErr').classList.add("toHide");
		document.getElementById('theQ').classList.remove("toHide");

		const [a, b] = pick2();

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
	allData.hist.push(ia1);
	allData.hist.push(ia2);
	while(allData.hist.length > scores.length/2 -1) {
		allData.hist.shift();
	}

	refreshTheQ();
}
