const hist = [
	/*	'name of a1', 'name of a2', ... 	// (First is oldest, Last is most recent) */
]
let scores = [
	// {n: 'name of a', p: 42, e: 53, m: 28} 	// p:plus, e:equal, m:minus
]

const PRELOADED_PICTS = []

const VOTE_SYSTEM = new VoteSystem()
function init() {
	// Init images
	const img1 = $('#a1 img'); img1.on('error', ()=>img1.attr('src', 'pict/unknown.svg'))
	const img2 = $('#a2 img'); img2.on('error', ()=>img2.attr('src', 'pict/unknown.svg'))

	// Init popups
	$( '#listItemsFilter' ).slider({
		//range: 'max',
		min: 0,
		max: 1,
		value: 0,
		step: .05,
		slide: refreshList,
	})

	refreshTheQ()
}

function addNewEntry() {
	const nEntr = document.getElementById('newEntry').value
	if(!nEntr) {
		alert('Please fill new entry name')
		return
	}

	VOTE_SYSTEM.entries.add(new Entry(nEntr))
	updateEntry(nEntr)
}
function updateEntry(entryCode) {
	const dial = $('#dialog-updateEntry')

	// Get data
	const entry = VOTE_SYSTEM.entries.getEntryByCode(entryCode)
	const newImgs = {}; // {<imgUrl>: true/false}

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

function calcS(a) {
	a.p = a.p.length // p: <nb of + votes>
	a.e = a.e.length // e: <nb of = votes>
	a.m = a.m.length // m: <nb of - votes>

	a.r = a.p + a.e + a.m // number of casted votes

	if(!a.r || !a.k) {
		a.x = 0
		a.u = 1
		a.d = 0
		a.s = .5
	} else {
		a.x = a.r/a.k; // % casted votes over max possible
		a.u = (1+(a.p+a.k-a.r)/a.k-a.m/a.k)/2 // score such as all uncasted votes are in favor
		a.d = (1+a.p/a.k-(a.m+a.k-a.r)/a.k)/2 // score such as all uncasted votes are against
		a.s = (a.u+a.d)/2 // average score
	}

	return a
}

let sortOrder = 0
function sortLists(orderCode) {
	sortOrder = orderCode
	refreshScores()
	refreshList()
}
function pemSort(a,b) {
	switch(sortOrder) {
	case -1:
		return (a.d<b.d?1 // sort by 1: minScore
			:(a.d>b.d?-1
			:(a.u<b.u?1 // 2: max possible score
			:(a.u>b.u?-1
			:(a.c.name<b.c.name?1 // 3: alphabetically
			:-1)))))
	case 1:
		return (a.u<b.u?1 // sort by 1: max possible score
			:(a.u>b.u?-1
			:(a.d<b.d?1 // 2: min possible score
			:(a.d>b.d?-1
			:(a.c.name<b.c.name?1 // 3: alphabetically
			:-1)))))
	default:
		return (a.s<b.s?1 // sort by 1:score
			:(a.s>b.s?-1
			:(a.u<b.u?1 // 2: max possible score
			:(a.u>b.u?-1
			:(a.c.name<b.c.name?1 // 3: alphabetically
			:-1)))))
	}
}
function refreshScores() {
	// Get votes data
	const scoresList = VOTE_SYSTEM.getFullVotesList()

	// Calc K: max votes possible to cast on a specific entry
	const calcK = (a)=>{
		a.k = a.t*(scoresList.length-a.t)
		return a
	}

	// Remove current scores
	while(scores.length) scores.pop()

	// Recompute scores
	scores = scoresList.map(calcK).map(calcS).sort(pemSort)
}
function refreshList() {
	function build(theList, minShow=0) {
		let htmlContent = ''
		let pts = 101, arnk = 0

		// filter the list
		const filteredList = theList.filter(a=>a.x >= minShow)

		for(const rnk in filteredList) {
			const a = filteredList[rnk]

			const t = a.r <= 0 ? 0 : 1/a.r
			const us = (sortOrder===-1?a.d:sortOrder===1?a.u:a.s)
			if(a.s < 0) {
				arnk = '-'
				pts = 0
			} else if(pts > us) {
				pts = us
				arnk = (rnk|0)+1
			}


			htmlContent += `<div class="listE">
	<div class="coll">
		<div class="rnk">${arnk}.&nbsp;</div>
		<div class="name">${a.c.name}</div>
		<button class="imgBtn" onclick="updateEntry(\'${a.c.code}\')"></button>
	</div>
	<div class="coll">
		<span class="sc" style="background-color: rgba(255,255,63,${pts*a.x});">`
			if(pts==='-') {
				htmlContent+='-'
			} else {
				htmlContent += `<span>${(100*a.d)|0}&nbsp;-&nbsp;</span><span class="ctr">${(100*a.s).toFixed(1)}</span><span>&nbsp;-&nbsp;${(100*a.u)|0}</span>`
			}
			htmlContent += `</span>
		<span class="rep" style="background-color: rgba(63,255,255,${a.x});">/${(100*a.x)|0}% (${a.r}/${a.k})</span>
	</div>
</div>`
		}
		return htmlContent
	}

	setTimeout(()=>{
		const fItems = $('#listItemsFilter').slider('value')
		document.getElementById('listItems').innerHTML = build(scores, fItems)
		$('#sliderShowSvgItems').empty().append(genRepartitionSvg(scores.map(a=>a.x))[0].outerHTML)
	}, 10)
}

function pick2() {
	let an, bn, minimizer = 1
	const filteredList = VOTE_SYSTEM.entries.entries.map(e=>e.code).filter(c=>hist.indexOf(c)<0)
	for(let i=filteredList.length; i>0; i--) {
		// Select random pair
		const a = (Math.random()*filteredList.length)|0
		const b = ((a-Math.random()*(filteredList.length-1)+filteredList.length)|0)%filteredList.length

		const newAn = filteredList[a]
		const newBn = filteredList[b]

		if(!VOTE_SYSTEM.getVote(newAn, newBn)) {
			an = newAn
			bn = newBn
			break
		}

		const newMinimizer = scores.find(a=>a.c.code===newAn).x * scores.find(b=>b.c.code===newBn).x
		if(newMinimizer < minimizer) {
			an = newAn
			bn = newBn
			minimizer = newMinimizer
		}
	}

	return [VOTE_SYSTEM.entries.getEntryByCode(an), VOTE_SYSTEM.entries.getEntryByCode(bn)]
}
function refreshTheQ() {
	refreshScores()
	refreshList()

	if(VOTE_SYSTEM.entries.entries.length < 2) {
		document.getElementById('theQ').classList.add('toHide')
		document.getElementById('theQErr').classList.remove('toHide')
	} else {
		document.getElementById('theQErr').classList.add('toHide')
		document.getElementById('theQ').classList.remove('toHide')

		const [a, b] = pick2()

		// Fill voting panel
		$('#a1 .title').text(a.name)
		$('#a2 .title').text(b.name)

		const pa1 = a.images
		const pa2 = b.images
		const pa1i = pa1.length ? pa1[(Math.random()*pa1.length)|0] : 'pict/unknown.svg'
		const pa2i = pa2.length ? pa2[(Math.random()*pa2.length)|0] : 'pict/unknown.svg'

		// Put images in preload div (for caching purposes)
		if(PRELOADED_PICTS.indexOf(pa1i) < 0) {
			PRELOADED_PICTS.push(pa1i)
			$('#pictPreload').append('<img src="' + pa1i + '"/>')
		}
		if(PRELOADED_PICTS.indexOf(pa2i) < 0) {
			PRELOADED_PICTS.push(pa2i)
			$('#pictPreload').append('<img src="' + pa2i + '"/>')
		}

		const img1 = $('#a1 img')
		const img2 = $('#a2 img')
		img1.attr('src', 'pict/loading.svg') // force
		img2.attr('src', 'pict/loading.svg') // force
		setTimeout(()=>{
			img1.attr('src', pa1i)
			img2.attr('src', pa2i)
		}, 10)

		$('#a0 #bSame').attr('onclick', '').unbind('click').click(()=>theQ(a.code, b.code, 'e'))
		$('#a1 button').attr('onclick', '').unbind('click').click(()=>theQ(a.code, b.code, 'p'))
		$('#a2 button').attr('onclick', '').unbind('click').click(()=>theQ(a.code, b.code, 'm'))
	}
}

function theQ(c1, c2, vote) {
	// vote: 0=No pref; 1=Pref 1; 2=Pref 2; other=skip
	if(vote === 'p' || vote === 'e' || vote === 'm') {
		VOTE_SYSTEM.castVote(c1, c2, vote)

		hist.push(c1)
		hist.push(c2)
		while(hist.length > VOTE_SYSTEM.entries.entries.length/2 -1) hist.shift()
	}
	refreshTheQ()
}

function showItemList() {
	const dial = $('#listItemsPopup')
	dial.dialog({
		title: 'Entries',
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


function genChartSVG() {
	const list = scores.filter(a=>a) // copy list to prevent editing it

	const svg = $('<svg>')
	svg.attr('xmlns', 'http://www.w3.org/2000/svg')
	svg.attr('viewBox', '0 0 1 ' + (list.length || 1))
	svg.attr('preserveAspectRatio', 'none')
	svg.css('display', 'block')
	svg.css('width', '100%')
	svg.css('height', '750px')
	svg.css('background-color', '#555')

	for(const i in list) {
		const item = list[i]

		const r = ((1-item.d)*255)|0
		const g = (item.u*255)|0
		const b = ((1-item.x)*255)|0

		const bloc = $('<rect>')
		bloc.attr('fill', `rgb(${r}, ${g}, ${b})`)
		bloc.attr('x', (item.d).toFixed(5))
		bloc.attr('width', (item.u - item.d).toFixed(5))
		bloc.attr('y', i)
		bloc.attr('height', 1)

		// TODO: Am�liorer ceci:
		const txt = $(`<svg viewBox='0 0 20 20' background='#FFF' preserveAspectRatio='none'><text x="50%" y="50%" alignment-baseline="middle" text-anchor="middle">${item.c.name}</text></svg>`)
		txt.attr('x', (item.d+(item.u - item.d)/2 - (list.length)/2).toFixed(5))
		txt.attr('y', i)
		txt.attr('width', list.length)
		txt.attr('height', 1)
		/*txt.attr('text-anchor', 'middle')
		txt.attr('font-size', 1)*/

		svg.append(bloc)
		svg.append(txt)
	}

	const zone = $('<rect>')
	zone.attr('fill', '#FFF8')
	zone.attr('x', (list[list.length-1].u).toFixed(5))
	zone.attr('width', (list[0].d - list[list.length-1].u).toFixed(5))
	zone.attr('y', 0)
	zone.attr('height', list.length)
	svg.prepend(zone)

	return svg
}
