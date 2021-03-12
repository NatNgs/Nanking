var ACTIVATE_COMPRESSION = true;

// LZW-compress
function lzwEncodeJson(json) {
	return lzwEncodeStr(JSON.stringify(json).slice(1,-1));
}
function lzwEncodeStr(s) {
	if(!ACTIVATE_COMPRESSION) {
		return s;
	}
	const dict = {};
	const out = [];
	let code = 256;

	const data = s.split("");
	let phrase = data.shift();
	let currChar;
	while((currChar=data.shift())) {
		if (dict[phrase + currChar] != null) {
			phrase += currChar;
		} else {
			out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
			dict[phrase + currChar] = code;
			code++;
			phrase=currChar;
		}
	}

	out.push(phrase.length > 1 ? dict[phrase] : phrase.charCodeAt(0));
	for (let i=0; i<out.length; i++) {
		out[i] = String.fromCharCode(out[i]);
	}
	return "lzw:" + out.join("");
}

// Decompress an LZW-encoded string
function lzwDecodeJson(lzwStr) {
	let str = lzwDecodeStr(lzwStr);
	if(!str.startsWith('{')) {
		str = '{' + str + '}';
	}
	return JSON.parse(str);
}
function lzwDecodeStr(s) {
	if(!s.startsWith("lzw:")) {
		return s;
	}

	const data = s.substring(4).split("");
	const dict = {};
	let currChar = data[0];
	let oldPhrase = currChar;
	const out = [currChar];
	let code = 256;
	let phrase;

	for (let i=1; i<data.length; i++) {
		const currCode = data[i].charCodeAt(0);
		if (currCode < 256) {
			phrase = data[i];
		} else {
			phrase = dict[currCode] ? dict[currCode] : (oldPhrase + currChar);
		}
		out.push(phrase);
		currChar = phrase.charAt(0);
		dict[code] = oldPhrase + currChar;
		code++;
		oldPhrase = phrase;
	}
	return out.join("");
}
