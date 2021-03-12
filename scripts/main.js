const allData = {
	votes: {
		/*
		"name of a1": {
			imgs: ["http://.../.png", ...],
			video: "http://...", 	// can be null
			tags: ["tag1", "tag2", ...],
			votes: {
				"name of a2": 0/1/2 	// 1=>prefer a1; 2=>prefer a2
			}
		},
		*/
	},
	hist: [
		/*	"name of a1", "name of a2", ... 	// (First is oldest, Last is most recent) */
	],
};
let scores = [
	// {n: "name of a", p: 42, e: 53, m: 28} 	// n:name  p:plus  e:equal  m:minus
];
let tags = [
	// {n: "tag", p: 42, e: 53, m: 28} 	// n:tag  p:plus  e:equal  m:minus
];

const PRELOADED_PICTS = [];

function init() {
	// Init images
	const img1 = $('#a1 img'); img1.on('error', ()=>img1.attr('src', 'pict/unknown.svg'));
	const img2 = $('#a2 img'); img2.on('error', ()=>img2.attr('src', 'pict/unknown.svg'));

	// Init popups
	$( "#listItemsFilter" ).slider({
		//range: "max",
		min: 0,
		max: 1,
		value: 0,
		step: .05,
		slide: refreshList,
	});
	$( "#listTagsFilter" ).slider({
		//range: "max",
		min: 0,
		max: 1,
		value: 0,
		step: .05,
		slide: refreshList,
	});

	refreshTheQ();
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
		title: 'Update entry',
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
					alert("Another entry already have this name");
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
	const p = a.p.length, e = a.e.length, m = a.m.length;
	a.r=p+e+m;

	a.x = a.r/a.k; // % casted votes over max possible votes
	if(!a.r) {
		a.u = 1;
		a.d = 0;
		a.a = a.s = a.o = .5;
		return a;
	}
	a.u = (1+(p+a.k-a.r)/a.k-m/a.k)/2; // score such as all uncasted votes are in favor
	a.d = (1+p/a.k-(m+a.k-a.r)/a.k)/2; // score such as all uncasted votes are against
	a.s = (a.u+a.d)/2; // score

	return {n:a.n, // n: name
		p:a.p.length, e:a.e.length, m:a.m.length, // p: <nb of + votes>, e: <nb of = votes>, m: <nb of - votes>
		d:a.d, s:a.s, u:a.u, // d: <min score>, s: <avg score>, u: <max score>
		t:a.t, k:a.k, x:a.x, // x: <% votes casted>
	};
}

let sortOrder = 0;
function sortLists(orderCode) {
	sortOrder = orderCode;
	refreshScores();
	refreshList();
}
function pemSort(a,b) {
	switch(sortOrder) {
	case -1:
		return (a.d<b.d?1 // sort by 1: minScore
			:(a.d>b.d?-1
			:(a.u<b.u?1 // 2: max possible score
			:(a.u>b.u?-1
			:(a.n<b.n?1 // 3: alphabetically
			:-1)))));
	case 1:
		return (a.u<b.u?1 // sort by 1: max possible score
			:(a.u>b.u?-1
			:(a.d<b.d?1 // 2: min possible score
			:(a.d>b.d?-1
			:(a.n<b.n?1 // 3: alphabetically
			:-1)))));
	default:
		return (a.s<b.s?1 // sort by 1:score
			:(a.s>b.s?-1
			:(a.u<b.u?1 // 2: max possible score
			:(a.u>b.u?-1
			:(a.n<b.n?1 // 3: alphabetically
			:-1)))));
	}
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
		tmpScores[a1] = {n: a1, p:[], e:[], m:[], t:1}; // init score

		for(const a2 in adv1.votes) {
			const adv2 = allData.votes[a2];
			const vote = adv1.votes[a2];
			if(!adv2 || a2 <= a1) {
				delete adv1.votes[a2]; // vote is wrong: remove it
			} else {
				switch(vote) {
				case 0:
					// Update elem score
					tmpScores[a1].e.push(a2);
					tmpScores[a2].e.push(a1); // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order

					// Update tags score
					for(const t1 of adv1.tags) {
						if(adv2.tags.indexOf(t1)<0) {
							if(!tmpTags[t1]) tmpTags[t1] = {n: t1, p:[], e:[], m:[], t:0}; // init tag if not exist
							tmpTags[t1].e.push(a2);
						}
					}
					for(const t2 of adv2.tags) {
						if(adv1.tags.indexOf(t2)<0) {
							if(!tmpTags[t2]) tmpTags[t2] = {n: t2, p:[], e:[], m:[], t:0}; // init tag if not exist
							tmpTags[t2].e.push(a1);
						}
					}

					break;
				case 1:
					// Update elem score
					tmpScores[a1].p.push(a2);
					tmpScores[a2].m.push(a1); // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order

					// Update tags score
					for(const t1 of adv1.tags) {
						if(adv2.tags.indexOf(t1)<0) {
							if(!tmpTags[t1]) tmpTags[t1] = {n: t1, p:[], e:[], m:[], t:0}; // init tag if not exist
							tmpTags[t1].p.push(a2);
						}
					}
					for(const t2 of adv2.tags) {
						if(adv1.tags.indexOf(t2)<0) {
							if(!tmpTags[t2]) tmpTags[t2] = {n: t2, p:[], e:[], m:[], t:0}; // init tag if not exist
							tmpTags[t2].m.push(a1);
						}
					}

					break;
				case 2:
					// Update elem score
					tmpScores[a1].m.push(a2);
					tmpScores[a2].p.push(a1); // already existing tmpScores[a2] because foreach a1 is reversed alphabetical order

					// Update tags score
					for(const t1 of adv1.tags) {
						if(adv2.tags.indexOf(t1)<0) {
							if(!tmpTags[t1]) tmpTags[t1] = {n: t1, p:[], e:[], m:[], t:0}; // init tag if not exist
							tmpTags[t1].m.push(a2);
						}
					}
					for(const t2 of adv2.tags) {
						if(adv1.tags.indexOf(t2)<0) {
							if(!tmpTags[t2]) tmpTags[t2] = {n: t2, p:[], e:[], m:[], t:0}; // init tag if not exist
							tmpTags[t2].p.push(a1);
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
			if(!tmpTags[t]) tmpTags[t] = {n: t, p:[], e:[], m:[], t:0}; // init tag if not exist
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
	function build(theList, minShow=0) {
		let htmlContent = '';
		let pts = 101, arnk = 0;

		// filter the list
		const filteredList = theList.filter(a=>a.x >= minShow);

		for(const rnk in filteredList) {
			const a = filteredList[rnk];

			const r = a.p + a.e + a.m;
			const t = r <= 0 ? 0 : 1/r;
			const us = (sortOrder===-1?a.d:sortOrder===1?a.u:a.s);
			if(a.s < 0) {
				arnk = '-';
				pts = 0;
			} else if(pts > us) {
				pts = us;
				arnk = (rnk|0)+1;
			}


			htmlContent += `<div class="listE">
	<div class="coll">
		<div class="rnk">${arnk}.&nbsp;</div>
		<div class="name">${a.n}</div>
		<button class="imgBtn" onclick="updateEntry(\'${a.n}\')"></button>
	</div>
	<div class="coll">
		<span class="sc" style="background-color: rgba(255,255,63,${pts*a.x});">`;

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

	setTimeout(()=>{
		const fItems = $("#listItemsFilter").slider("value");
		const fTags = $("#listTagsFilter").slider("value");
		document.getElementById('listItems').innerHTML = build(scores, fItems);
		document.getElementById('listTags').innerHTML = build(tags, fTags);

		$('#sliderShowSvgItems').empty().append(genRepartitionSvg(scores.map(a=>a.x))[0].outerHTML);
		$('#sliderShowSvgTags').empty().append(genRepartitionSvg(tags.map(a=>a.x))[0].outerHTML);
	}, 10);
}

function pick2() {
	let an, bn, minimizer = 1;
	const filteredList = Object.keys(allData.votes).filter(a=>allData.hist.indexOf(a)<0);
	for(let i=filteredList.length; i>0; i--) {
		// Select random pair
		const a = (Math.random()*filteredList.length)|0;
		const b = ((a-Math.random()*(filteredList.length-1)+filteredList.length)|0)%filteredList.length;

		const newAn = filteredList[a];
		const newBn = filteredList[b];

		if(!((newAn<newBn?newBn:newAn) in allData.votes[newAn<newBn?newAn:newBn].votes)) {
			an = newAn;
			bn = newBn;
			break;
		}

		const newMinimizer = scores.find(a=>a.n===newAn).x * scores.find(b=>b.n===newBn).x;
		if(newMinimizer < minimizer) {
			an = newAn;
			bn = newBn;
			minimizer = newMinimizer;
		}
	}

	return [an, bn];
}
function refreshTheQ() {
	refreshScores();
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
		const pa1i = pa1.length ? pa1[(Math.random()*pa1.length)|0] : 'pict/unknown.svg';
		const pa2i = pa2.length ? pa2[(Math.random()*pa2.length)|0] : 'pict/unknown.svg';

		// Put images in preload div (for caching purposes)
		if(PRELOADED_PICTS.indexOf(pa1i) < 0) {
			PRELOADED_PICTS.push(pa1i);
			$('#pictPreload').append('<img src="' + pa1i + '"/>');
		}
		if(PRELOADED_PICTS.indexOf(pa2i) < 0) {
			PRELOADED_PICTS.push(pa2i);
			$('#pictPreload').append('<img src="' + pa2i + '"/>');
		}

		const img1 = $('#a1 img');
		const img2 = $('#a2 img');
		img1.attr('src', 'pict/loading.svg'); // force
		img2.attr('src', 'pict/loading.svg'); // force
		setTimeout(()=>{
			img1.attr('src', pa1i);
			img2.attr('src', pa2i);
		}, 10);

		$('#a0 #bSame').attr("onclick", "").unbind("click").click(()=>theQ(a, b, 0));
		$('#a1 button').attr("onclick", "").unbind("click").click(()=>theQ(a, b, 1));
		$('#a2 button').attr("onclick", "").unbind("click").click(()=>theQ(a, b, 2));
	}
}

function theQ(ia1, ia2, vote) {
	// vote: 0=No pref; 1=Pref 1; 2=Pref 2; other=skip
	if(vote === 0 || vote === 1 || vote === 2) {
		const a = (ia1<ia2?ia1:ia2);
		const b = (ia1<ia2?ia2:ia1);
		const a1 = allData.votes[a];
		a1.votes[b] = (vote<=0?0: (ia1<ia2?vote:vote%2+1));

		allData.hist.push(ia1);
		allData.hist.push(ia2);
		while(allData.hist.length > scores.length/2 -1) {
			allData.hist.shift();
		}
	}

	refreshTheQ();
}

function showItemList() {
	const dial = $('#listItemsPopup');
	dial.dialog({
		title: 'Entries',
		width: 'auto',
		height: 'auto',
	});
	dial.css('width', dial.width()*1.2);
	dial.css('heigth', dial.height()*1.2);
	dial.dialog('widget').css({ position: 'fixed' }).position({ my: 'center', at: 'center', of: window });
}
function showTagList() {
	const dial = $('#listTagsPopup');
	dial.dialog({
		title: 'Tags',
		width: 'auto',
		height: 'auto',
	});
	dial.css('width', dial.width()*1.2);
	dial.css('heigth', dial.height()*1.2);
	dial.dialog('widget').css({ position: 'fixed' }).position({ my: 'center', at: 'center', of: window });
}

function genRepartitionSvg(list) {
	// list: [<number between 0 & 1>, ...]
	list.sort();

	const svg = $('<svg>');
	svg.attr('xmlns', 'http://www.w3.org/2000/svg');
	svg.attr('viewBox', '0 0 1 ' + (list.length || 1));
	svg.attr('preserveAspectRatio', 'none');
	svg.css('display', 'block');
	svg.css('width', '100%');
	svg.css('height', '100%');
	svg.css('background-color', '#eee');

	//svg.append($('<rect x="0" y="0" width="1" height="' + (list.length || 1) + '" fill="#' + ((Math.random()*10)|0) + '' + ((Math.random()*10)|0) + '' + ((Math.random()*10)|0) + '"></rect>'));

	const ll = list.length;
	let w1 = 0;
	while(list.length) {
		const bloc = $('<rect fill="#222"></rect>');
		const h = list.length;
		const w2 = list.shift();
		while(list[0]===w2) list.shift();

		bloc.attr('x', 0);
		bloc.attr('width', (w2).toFixed(5));
		bloc.attr('y', ll-h);
		bloc.attr('height', h);
		svg.append(bloc);
		w1 = w2;
	}

	return svg;
}


function genChartSVG() {
	const list = scores.filter(a=>a); // copy list to prevent editing it

	const svg = $('<svg>');
	svg.attr('xmlns', 'http://www.w3.org/2000/svg');
	svg.attr('viewBox', '0 0 1 ' + (list.length || 1));
	svg.attr('preserveAspectRatio', 'none');
	svg.css('display', 'block');
	svg.css('width', '100%');
	svg.css('height', '750px');
	svg.css('background-color', '#555');

	for(const i in list) {
		const item = list[i];

		const r = ((1-item.d)*255)|0;
		const g = (item.u*255)|0;
		const b = ((1-item.x)*255)|0;

		const bloc = $('<rect>');
		bloc.attr('fill', `rgb(${r}, ${g}, ${b})`);
		bloc.attr('x', (item.d).toFixed(5));
		bloc.attr('width', (item.u - item.d).toFixed(5));
		bloc.attr('y', i);
		bloc.attr('height', 1);

		// TODO: Améliorer ceci:
		const txt = $(`<svg viewBox='0 0 20 20' background='#FFF' preserveAspectRatio='none'><text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle">${item.n}</text></svg>`);
		txt.attr('x', (item.d+(item.u - item.d)/2 - (list.length)/2).toFixed(5));
		txt.attr('y', i);
		txt.attr('width', list.length);
		txt.attr('height', 1);
		/*txt.attr('text-anchor', 'middle');
		txt.attr('font-size', 1);*/

		svg.append(bloc);
		svg.append(txt);
	}

	const zone = $('<rect>');
	zone.attr('fill', '#FFF8');
	zone.attr('x', (list[list.length-1].u).toFixed(5));
	zone.attr('width', (list[0].d - list[list.length-1].u).toFixed(5));
	zone.attr('y', 0);
	zone.attr('height', list.length);
	svg.prepend(zone);

	return svg;
}
