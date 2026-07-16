

const FORMATTERS = {
	// Nanking score: [0, 1] (float)
	'Percent': { // Percent: [0, 100] (float)
		toNorm: (formattedScore) => (+formattedScore / 100),
		toFormat: (normScore) => (normScore * 100),
		pretty: (normScore) => (normScore * 100).toFixed(0),
		min: 0,
		max: 100,
		step: 1
	},
	'MAL': { // Mal score: [1, 10] (interger)
		toNorm: (formattedScore) => ((formattedScore - 1) / 9),
		toFormat: (normScore) => (1 + (+normScore * 9)),
		pretty: (normScore) => (1 + (normScore * 9)).toFixed(0),
		min: 1,
		max: 10,
		step: 1
	}
}
let FORMATTER = FORMATTERS.Percent

const _whenUpdatingFormat = []
function onUpdateScoreFormat(callback) {
	_whenUpdatingFormat.push(callback)
	return _whenUpdatingFormat.length-1
}
function updateScoreFormat(newFormatKey) {
	if(!FORMATTERS[newFormatKey]) throw new Error(`Unknown format ${newFormatKey}`)

	const previous = FORMATTER
	FORMATTER = FORMATTERS[newFormatKey]
	for(const callback of _whenUpdatingFormat) if(callback) callback(previous, FORMATTER)
}
