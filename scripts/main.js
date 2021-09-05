const hist = [
	/*	'name of a1', 'name of a2', ... 	// (First is oldest, Last is most recent) */
]

const PRELOADED_PICTS = []

const VOTE_SYSTEM = new VoteSystem()
const SCORE_SYSTEM = new ScoreSystem(VOTE_SYSTEM)
function init() {
	// Init images
	const img1 = $('#a1 img'); img1.on('error', ()=>img1.attr('src', 'pict/unknown.svg'))
	const img2 = $('#a2 img'); img2.on('error', ()=>img2.attr('src', 'pict/unknown.svg'))

	// Init popups
	$('#listItemsFilter').slider({
		//range: 'max',
		min: 0,
		max: 1,
		value: 0,
		step: .05,
		slide: refreshList,
	})
	$('#listItemsCategory').on('change', refreshList)

	refreshTheQ()
}

function addNewEntry() {
	const nEntr = document.getElementById('newEntry').value
	if(!nEntr) {
		alert('Please fill new entry name')
		return
	}

	const e = new Entry(nEntr)
	VOTE_SYSTEM.entries.add(e)
	updateEntry(e.code)
	document.getElementById('newEntry').value = ''
}
function updateEntry(entryCode) {
	const dial = $('#dialog-updateEntry')

	// Get data
	const entry = VOTE_SYSTEM.entries.getEntryByCode(entryCode)
	const newImgs = {} // {<imgUrl>: true/false}

	function showImg(divImgs, imgUrl) {
		const newDiv = $('<li name="'+ imgUrl +'"><img src="'+ imgUrl +'"/><button class="cross"/></li>')
		divImgs.append(newDiv)
		$('.cross', newDiv).click(()=>{
			newImgs[imgUrl] = false
			$('*[name="'+ imgUrl +'"]', divImgs).remove()
		})
	}

	// Update dialog content
	const divImgs = $('#updateEntry-imgs').empty()
	for(const img of entry.images) {
		newImgs[img] = true
		showImg(divImgs, img)
	}

	const imgInpt = $('#updateEntry-newImgInpt').val('')
	$('#updateEntry-newImg').unbind('click').click(()=>{
		const val = imgInpt.val()
		if(val && !newImgs[val]) {
			testImage(val, ()=>{ // On Success
				newImgs[val] = true
				showImg(divImgs, val)
				imgInpt.val('')
			}, ()=>{ // On Error
				alert('Error: Cannot show image at this url (Timeout after 2.5s)')
			}, 2500)
		}
	})

	const nameInpt = $('#updateEntry-name').val(entry.name)

	// Show dialog
	dial.dialog({
		title: 'Update entry',
		width: 'auto',
		modal: true,
		buttons: {
			'Delete /!\\': function() {
				if(!confirm('Entry "'+ entry.name +'", all related information, and related votes will be removed.\nConfirm ?')) return
				VOTE_SYSTEM.removeEntry(entry.code)
				dial.dialog('close')
				refreshTheQ()
			},
			'Confirm': function() {
				// Check new entry name
				const newEntryName = nameInpt.val().trim()
				if(!newEntryName) {
					alert('Value is blank')
					return
				}
				if(newEntryName !== entry.name && VOTE_SYSTEM.entries.getEntryByName(newEntryName)) {
					alert('Another entry already have this name')
					return
				}

				// Rename entry
				entry.name = newEntryName

				// Update Entry lists
				entry.images = Object.keys(newImgs).filter(a=>newImgs[a]).sort()

				dial.dialog('close')
				refreshTheQ()
				setTimeout(updateCategoriesSelector())
			},
			'Reset': function() {
				updateEntry(entry.code)
			},
			'Cancel': function() {
				dial.dialog( 'close' )
			}
		}
	})
}

function testImage(url, onSuccess, onError, timeout = 1000) {
	let timedOut = false, timer
	const img = new Image()
	img.onerror = img.onabort = function() {
		if (!timedOut) {
			clearTimeout(timer)
			onError(url, 'error')
		}
	}
	img.onload = function() {
		if (!timedOut) {
			clearTimeout(timer)
			onSuccess(url, 'success')
		}
	}
	img.src = url
	timer = setTimeout(function() {
		timedOut = true
		img.src = '//!!!!/test.jpg'; // reset .src to invalid URL so it stops previous
		onError(url, 'timeout')
	}, timeout)
}

function pemSort(a,b) {
	return a.s<b.s?1 // sort by 1: score (from direct and indirect votes)
		:(a.s>b.s?-1
		:(a.z<b.z?1 // 2: average score (from direct votes only)
		:(a.z>b.z?-1
		:(a.name>b.name?1 // 3: alphanumerical
		:-1))))
}

function floatToRGBA(redGreen, alpha) {
	let r, g, b=63;
	if(redGreen > .5) {
		const x = (redGreen-0.5)*2
		r = 63+((1-x)*160)
		g = 223
	} else {
		const x = redGreen*2
		r = 223
		g = 63+(x*160)
	}
	return `rgba(${r|0},${g|0},${b|0},${alpha})`
}
function buildHTMLRankingList(theList, minShow=0) {
	let htmlContent = ''
	let pts = 101, arnk = 0

	// filter the list
	const filteredList = theList.filter((a)=>a.ix >= minShow)

	for(const rnk in filteredList) {
		const a = filteredList[rnk]
		// a: {eId, name, k, s, z, dx, dr, dd, du, ix, ir, id, iu, rnk}

		if(a.s < 0) {
			arnk = '-'
			pts = 0
		} else if(pts > a.s) {
			pts = a.s
			arnk = (rnk|0)+1
		}

		htmlContent += `<div class="listE"><div class="coll"><div class="rnk">${arnk}.&nbsp;`
		if(a.rnk > 0) {
			htmlContent += `<div class="up">▲<br/>+${a.rnk}</div>`
		} else if(a.rnk < 0) {
			htmlContent += `<div class="down">${a.rnk}<br/>▼</div>`
		}
		htmlContent += `</div><div class="name">${a.name}</div>`

		if(a.eId) {
			htmlContent += `<button class="imgBtn" onclick="updateEntry(\'${a.eId}\')"></button>`
		}

		htmlContent += '</div><div class="coll"><span class="sc">'

		if(pts==='-') {
			htmlContent += '-'
		} else {
			htmlContent += `
				<div class="bar" style="left:0; width:${100*a.dd}%; background-color: ${floatToRGBA(a.du, 1)};"></div>
				<div class="bar clipL" style="left:${100*a.dd}%; width:${100*(a.id-a.dd)}%; background-color: ${floatToRGBA(a.iu, 0.5)};"></div>
				<div class="bar clipR" style="left:${100*a.iu}%; right:${100*(1-a.du)}%; background-color: ${floatToRGBA(a.id, 0.5)};"></div>
				<div class="bar" style="left:${100*a.du}%; right:0; background-color: ${floatToRGBA(a.dd, 1)};"></div>`

			htmlContent += `<div class="ctr" style="left:${100*a.s}%; transform: translateX(-${100*a.s}%);">${(100*a.s).toFixed(1)}<span class="rep">&nbsp;(${a.dr}/${a.k})</span></div>`
		}

		htmlContent += '</span></div></div>'
	}
	return htmlContent
}
function refreshList() {
	const category = $('#listItemsCategory').val()
	const fItems = $('#listItemsFilter').slider('value')

	const scoreList = []
	if(SCORE_SYSTEM.scores) {
		const oldList = []
		if(!category || !SCORE_SYSTEM.scores.tags[category]) {
			for(const eId in SCORE_SYSTEM.scores.entries) {
				const data = SCORE_SYSTEM.scores.entries[eId] // {c: <Entry object>, k, d: {p, e, m, r, x, u, d, s, z}, i: {p, e, m, r, x, u, d, s, z}}
				const old = SCORE_SYSTEM.lastScores && SCORE_SYSTEM.lastScores.entries[eId]
				scoreList.push({
					eId: eId,
					name: data.c.name, k: data.k, s: data.i.s, z: data.d.z,
					dx: data.d.x, dr: data.d.r, dd: data.d.d, du: data.d.u,
					ix: data.i.x, ir: data.i.r, id: data.i.d, iu: data.i.u,
				})
				if(old) {
					oldList.push({name: data.c.name, s: old.i.s, z: old.d.z})
				} else {
					oldList.push({name: data.c.name})
				}
			}
		} else {
			for(const tag in SCORE_SYSTEM.scores.tags[category]) {
				const data = SCORE_SYSTEM.scores.tags[category][tag] // {k, d: {p, e, m, r, x, u, d, s, z}, i: {p, e, m, r, x, u, d, s, z}}
				const old = SCORE_SYSTEM.lastScores && SCORE_SYSTEM.lastScores.tags[category] && SCORE_SYSTEM.lastScores.tags[category][tag]
				scoreList.push({
					name: tag, k: data.k, s: data.i.s, z: data.d.z,
					dx: data.d.x, dr: data.d.r, dd: data.d.d, du: data.d.u,
					ix: data.i.x, ir: data.i.r, id: data.i.d, iu: data.i.u,
				})
				if(old) {
					oldList.push({name: tag, s: old.i.s, z: old.d.z})
				} else {
					oldList.push({name: tag})
				}
			}
		}
		scoreList.sort(pemSort)
		const sortedOldList = oldList.sort(pemSort).map(e=>e.name)

		// Compute ranking
		for(let i=0; i<scoreList.length; i++) {
			const oldIndex = sortedOldList.indexOf(scoreList[i].name)
			if(oldList[oldIndex].s || oldList[oldIndex].s===0) {
				scoreList[i].rnk = oldIndex - i
			}
		}
	}

	document.getElementById('listItems').innerHTML = buildHTMLRankingList(scoreList, fItems)
	$('#sliderShowSvgItems').empty().append(genRepartitionSvg(scoreList.map(a=>a.x))[0].outerHTML)
}

function pick2() {
	// Most recent vote: Last
	const eIdList = VOTE_SYSTEM.entries.entries.map(e=>e).sort((e1,e2)=>e1.lastVote<e2.lastVote?-1:1).map(e=>e.code)
	const eId1 = eIdList.shift()

	if(!SCORE_SYSTEM.scores) {
		return [VOTE_SYSTEM.entries.getEntryByCode(eId1), VOTE_SYSTEM.entries.getEntryByCode(eIdList.shift())]
	}

	// Ignore the very last vote
	if(eIdList.length > 2) {
		eIdList.pop()
		eIdList.pop()
	}

	let eId2 = null
	let qualityWithE2 = -1 // 0 if vote between e1 & e2 already casted; otherwise = % of votes not casted for e2

	for(let i=Math.sqrt(eIdList.length); i>0; i--) {
		// Pick random other entry
		const e3Index = (Math.random()*eIdList.length)|0
		const eId3 = eIdList[e3Index]

		// Remove e3 from eIdList
		eIdList[e3Index] = eIdList[eIdList.length-1]
		eIdList.length --

		// Compute quality
		const qualityWithE3 = VOTE_SYSTEM.getVote(eId1, eId3) ? 0 : (1-SCORE_SYSTEM.scores.entries[eId3].x)

		if(qualityWithE3 > qualityWithE2) {
			eId2 = eId3
			qualityWithE2 = qualityWithE3
		}
	}

	return [VOTE_SYSTEM.entries.getEntryByCode(eId1), VOTE_SYSTEM.entries.getEntryByCode(eId2)]
}
function prepareNextVote() {
	const [a, b] = pick2()

	// Fill voting panel
	$('#a1 .title').text(a.name)
	$('#a2 .title').text(b.name)

	const pa1 = a.images
	const pa2 = b.images
	const pa1i = pa1.length ? pa1[(Math.random()*pa1.length)|0] : 'pict/unknown.svg'
	const pa2i = pa2.length ? pa2[(Math.random()*pa2.length)|0] : 'pict/unknown.svg'

	// Set loading picture
	const img1 = $('#a1 img').attr('src', 'pict/loading.svg')
	const img2 = $('#a2 img').attr('src', 'pict/loading.svg')
	setTimeout(()=>{
		// Put images in preload div (for caching purposes)
		if(PRELOADED_PICTS.indexOf(pa1i) < 0) {
			PRELOADED_PICTS.push(pa1i)
			$('#pictPreload').append('<img src="' + pa1i + '"/>')
		}
		if(PRELOADED_PICTS.indexOf(pa2i) < 0) {
			PRELOADED_PICTS.push(pa2i)
			$('#pictPreload').append('<img src="' + pa2i + '"/>')
		}

		// Set actual picture
		img1.attr('src', pa1i)
		img2.attr('src', pa2i)
	})

	$('#a0 #bSkip').attr('onclick', '').unbind('click').on('click', ()=>theQ(a.code, b.code, null))
	$('#a0 #bSame').attr('onclick', '').unbind('click').on('click', ()=>theQ(a.code, b.code, 'e'))
	$('#a1 button').attr('onclick', '').unbind('click').on('click', ()=>theQ(a.code, b.code, 'p'))
	$('#a2 button').attr('onclick', '').unbind('click').on('click', ()=>theQ(a.code, b.code, 'm'))
}
function updateCategoriesSelector() {
	const lic = $('#listItemsCategory')
	const catList = Object.keys(VOTE_SYSTEM.entries.getTagsMap())

	const alreadyIn = []
	// Remove deleted categories
	for(const opt of lic.children('option')) {
		if(!opt.value) continue
		if(catList.indexOf(opt.value) < 0) {
			opt.value=null
		} else {
			alreadyIn.push(opt.value)
		}
	}
	lic.children('option[value=null]').remove()
	// Add missing categories
	for(const opt of catList) {
		if(alreadyIn.indexOf(opt) >= 0) continue
		alreadyIn.push(opt)
		alreadyIn.sort()
		const index = alreadyIn.indexOf(opt)
		$(lic.children('option').get(index-1)).after(`<option value="${opt}">${opt}</option>`)
	}
}
function refreshTheQ() {
	if(VOTE_SYSTEM.entries.entries.length < 2) {
		document.getElementById('theQ').classList.add('toHide')
		document.getElementById('theQErr').classList.remove('toHide')
		refreshList()
		return
	}

	document.getElementById('theQErr').classList.add('toHide')
	document.getElementById('theQ').classList.remove('toHide')

	const directVotesMap = VOTE_SYSTEM.getFullDirectVotesMap()
	setTimeout(()=>{
		SCORE_SYSTEM.refreshScoresDirect(directVotesMap)
		prepareNextVote()
		setTimeout(()=>{
			SCORE_SYSTEM.refreshScoresIndirect(directVotesMap);
			refreshList()
		}, 100)
	})
}

function theQ(c1, c2, vote) {
	VOTE_SYSTEM.castVote(c1, c2, vote)
	refreshTheQ()
}

function showItemList() {
	const dial = $('#listItemsPopup')
	dial.dialog({
		title: 'Ranking',
		width: 'auto',
		height: 'auto',
	})
	dial.css('width', dial.width()*1.2)
	dial.css('heigth', dial.height()*1.2)
	dial.dialog('widget').css({ position: 'fixed' }).position({ my: 'center', at: 'center', of: window })
}

function genRepartitionSvg(list) {
	// list: [<number between 0 & 1>, ...]
	list.sort()

	const svg = $('<svg>')
	svg.attr('xmlns', 'http://www.w3.org/2000/svg')
	svg.attr('viewBox', '0 0 1 ' + (list.length || 1))
	svg.attr('preserveAspectRatio', 'none')
	svg.css('display', 'block')
	svg.css('width', '100%')
	svg.css('height', '100%')
	svg.css('background-color', '#eee')

	//svg.append($('<rect x="0" y="0" width="1" height="' + (list.length || 1) + '" fill="#' + ((Math.random()*10)|0) + '' + ((Math.random()*10)|0) + '' + ((Math.random()*10)|0) + '"></rect>'))

	const ll = list.length
	let w1 = 0
	while(list.length) {
		const bloc = $('<rect fill="#222"></rect>')
		const h = list.length
		const w2 = list.shift()

		if(!w2) break

		while(list[0]===w2) list.shift()

		bloc.attr('x', 0)
		bloc.attr('width', (w2).toFixed(5))
		bloc.attr('y', ll-h)
		bloc.attr('height', h)
		svg.append(bloc)
		w1 = w2
	}

	return svg
}
