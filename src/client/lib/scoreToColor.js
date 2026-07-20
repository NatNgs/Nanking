// Score is from 0 to 1
// Convert it to a color: 0 => #000000, 0.3 => #FF0000, 0.6 => #FFFF00, 0.9 => #00AA00, 1 => #00AAFF
const COLORS = [{step:0, r:0, g:0, b:0}, {step:0.3, r:255, g:0, b:0}, {step:0.6, r:255, g:255, b:0}, {step:0.9, r:0, g:170, b:0}, {step:1, r:0, g:170, b:255}]

function scoreToColor(score) {
	// Find the two colors around current score
	let i = 1
	while(score > COLORS[i].step && i < COLORS.length - 1) {
		i++
	}

	// Interpolate between the two colors
	const prevColor = COLORS[i-1]
	const nextColor = COLORS[i]
	const r = Math.round(prevColor.r + (nextColor.r - prevColor.r) * (score - prevColor.step) / (nextColor.step - prevColor.step))
	const g = Math.round(prevColor.g + (nextColor.g - prevColor.g) * (score - prevColor.step) / (nextColor.step - prevColor.step))
	const b = Math.round(prevColor.b + (nextColor.b - prevColor.b) * (score - prevColor.step) / (nextColor.step - prevColor.step))
	return `rgb(${r},${g},${b})`
}

export { scoreToColor }
