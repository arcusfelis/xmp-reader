'use strict'

const DEBUG = false;

const sax = require('sax');

const markerBegin = '<x:xmpmeta';
const markerEnd = '</x:xmpmeta>';

/* The text-content of these tags are ignored in the output */
const envelopeTags = [
	'x:xmpmeta',
	'rdf:RDF',
	'rdf:Description',
	'rdf:Bag',
	'rdf:Alt',
	'rdf:Seq',
	'rdf:li',
	'mwg-rs:RegionList'
];

/* Map the different meta keys to a single definition */
const keyTransform = {
	'mwg-rs:Regions': 'region',
	'MicrosoftPhoto:LastKeywordXMP': 'keywords',
	'MicrosoftPhoto:LastKeywordIPTC': 'keywords',
	'dc:subject': 'keywords',
	'MicrosoftPhoto:Rating': 'mRating',
	'cc:attributionName': 'attribution',
	'xmpRights:UsageTerms': 'terms',
	'dc:rights': 'terms'
}


function capitalizeFirstLetter(string) {
	return string.charAt(0).toUpperCase() + string.slice(1);
}

function lowercaseFirstLetter(string) {
	return string.charAt(0).toLowerCase() + string.slice(1);
}

module.exports = (buffer) => new Promise((resolve, reject) => {
	if (!Buffer.isBuffer(buffer)) reject('Not a Buffer');
	else {
		let data = {
			raw: {}
		};
		let offsetBegin = buffer.indexOf(markerBegin);
		if (offsetBegin > 0) {
			let offsetEnd = buffer.indexOf(markerEnd);
			if (DEBUG) console.log(offsetBegin, offsetEnd);
			if (offsetEnd > 0) {
				let xmlBuffer = buffer.slice(offsetBegin, offsetEnd + markerEnd.length);
				let parser = sax.parser(true);
				let nodeName;
				let nodePath = [];

				parser.onerror = (err) => reject(err);
				parser.onend = () => resolve(data);

				parser.onopentag = function (node) {
					nodeName = node.name;
					nodePath.push(node.name);
				};

				parser.onclosetag = function (node) {
					nodePath.pop();
				};

				function getLastKeyFromPath(path) {
					return path.filter(p => envelopeTags.indexOf(p) < 0).pop();
				};

				function getKeyFromPath(path) {
					return path
						.filter(p => envelopeTags.indexOf(p) < 0)
						.map(p => keyTransform[p] || p)
						.map(p => p.indexOf(':') >= 0 ? p.split(':')[1] : p)
						.map((p, i) => i == 0 ? lowercaseFirstLetter(p) : capitalizeFirstLetter(p))
						.join('');
				}

				function updateData(oldData, newData) {
					if (oldData === undefined) {
						return newData;
					} else {
						if (!Array.isArray(oldData)) {
							return [oldData, newData];
						}
						oldData.push(newData);
						return oldData;
					}
				}

				parser.ontext = function (text) {
					if (text.trim() != '') {
						var value;
						switch (nodeName) {
							case 'stArea:x':
							case 'stArea:y':
							case 'stArea:w':
							case 'stArea:h':
								value = parseFloat(text);
								break;
							case 'xmp:Rating':
								value = parseInt(text);
								break;
							case 'MicrosoftPhoto:Rating':
								value = Math.floor((parseInt(text) + 12) / 25) + 1;
								break;
							default:
								value = text
						}
						let rawKey = getLastKeyFromPath(nodePath);
						data.raw[rawKey] = updateData(data.raw[rawKey], value);

						let key = getKeyFromPath(nodePath);
						data[key] = updateData(data[key], value);
					}
				};

				parser.write(xmlBuffer.toString('utf-8', 0, xmlBuffer.length)).close();
			} else resolve(data);
		} else resolve(data);
	}
});
