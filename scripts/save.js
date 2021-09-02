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
	const strData = LZW.encodeJson({v:3, d:VOTE_SYSTEM.export()})
	const blob = new Blob([strData], {type: 'text/plain'})
	const link = document.getElementById('fileToExport')
	link.href = window.URL.createObjectURL(blob)
	link.click()
}
function loadData(rawdata) {
	try {
		data = LZW.decodeJson(rawdata)
	} catch(e) {
		console.error(e)
		alert("Error: Cannot read or decode file.")
		return
	}

	if(data && data.v===3) {
		VOTE_SYSTEM.import(data.d)
	} else {
		alert("Error: Unexpected data format. Save file is either wrong, corrupted or is using an incompatible version.")
		return false
	}

	refreshTheQ()
	setTimeout(updateCategoriesSelector)
}

function resetData() {
	if(!VOTE_SYSTEM.hasData() || confirm("Confirm reset data ?")) {
		VOTE_SYSTEM.reset()
		$('#fileToExport').attr('download', 'save.' + (LZW.enable ? 'lzw' : 'json'))
	}
	refreshTheQ()
	setTimeout(updateCategoriesSelector())
}

function limF(a, prec) {
	return (''+(Math.round(a*(10**prec))/(10**prec))).replace(/^0\./, '.').replace(new RegExp('^(\.[0-9]{'+ prec + '})[0-9]+$'), '$1')
}
function exportVotes() {
	const prec = 5
	const tsv = Object.values(SCORE_SYSTEM.scores.entries).map(e=>
		[e.c.name.replace(/\s+/g, ' '), limF(e.d, prec), limF(e.s, prec), limF(e.u, prec), limF(e.x, prec), e.p, e.e, e.m].join('\t')
	).join('\n')
	const blob = new Blob([tsv], {type: 'text/tsv'})
	const link = document.getElementById('fileToExport')
	const oldFileName = link.download
	link.download = 'votes.tsv'
	link.href = window.URL.createObjectURL(blob)
	link.click()
	setTimeout(()=>link.download = oldFileName, 100)
}
function exportEntryList() {
	const data = {e: VOTE_SYSTEM.entries.exportSimple()}
	const blob = new Blob([JSON.stringify(data)], {type: 'text/tsv'})
	const link = document.getElementById('fileToExport')
	const oldFileName = link.download
	link.download = link.download.replace(/\.[^.]+$/, '-list.json')
	link.href = window.URL.createObjectURL(blob)
	link.click()
	setTimeout(()=>link.download = oldFileName, 100)
}
function importEntryList() {
	const filesToLoad = document.getElementById("importEntryList")
	let nbTodo = filesToLoad.files.length
	const doneOne = () => {
		if(--nbTodo <= 0) {
			refreshTheQ()
			setTimeout(updateCategoriesSelector())
		}
	}
	for(const fileToLoad of filesToLoad.files) {
		const reader = new FileReader()
		reader.onload = (event) => {
			VOTE_SYSTEM.entries.importSimple(JSON.parse(event.target.result).e, true)
			doneOne()
		}
		reader.onerror = (error) => {
			alert("Problem while reading the file.");
			console.log(error)
			doneOne()
		}

		reader.readAsText(fileToLoad, "UTF-8")
	}
}
