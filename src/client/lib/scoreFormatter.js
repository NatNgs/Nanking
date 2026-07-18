// Nanking score: [0, 1] (float)
const FORMATTERS = {
	Percent: { // Percent: [0, 100] (float)
		toNorm: (formattedScore) => (+formattedScore / 100),
		toFormat: (normScore) => (normScore * 100),
		pretty: (normScore) => (normScore * 100).toFixed(0) + '%',
		min: 0,
		max: 100,
		step: 1,
	},
	MAL: { // Mal score: [1, 10] (integer)
		toNorm: (formattedScore) => ((formattedScore - 1) / 9),
		toFormat: (normScore) => (1 + (+normScore * 9)),
		pretty: (normScore) => (1 + (normScore * 9)).toFixed(0),
		min: 1,
		max: 10,
		step: 1,
	},
}

export { FORMATTERS }
