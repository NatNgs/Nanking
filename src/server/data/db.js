import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import CONFIG from '../config/config.js'

/**
 * Reads a nested value from `root` using a dot-separated path.
 */
function getPath(root, path) {
	if(!path) return root
	let node = root
	for(const key of path.split('.')) {
		if(node == null) return undefined
		node = node[key]
	}
	return node
}

/**
 * Writes a nested value into `root` using a dot-separated path, creating
 * intermediate objects as needed. A null/empty path replaces `root`'s own content.
 */
function setPath(root, path, value) {
	if(!path) {
		for(const key in root) delete root[key]
		Object.assign(root, value)
		return
	}
	const keys = path.split('.')
	const lastKey = keys.pop()
	let node = root
	for(const key of keys) {
		if(typeof node[key] !== 'object' || node[key] === null) node[key] = {}
		node = node[key]
	}
	node[lastKey] = value
}

/**
 * Deletes a nested value from `root` using a dot-separated path.
 */
function deletePath(root, path) {
	if(!path) {
		for(const key in root) delete root[key]
		return
	}
	const keys = path.split('.')
	const lastKey = keys.pop()
	const node = getPath(root, keys.join('.'))
	if(node != null) delete node[lastKey]
}

class Manager {
	constructor(db, key=null) {
		this.db = db
		this.parent = key || null
	}

	// Sub-managers
	sub(key) {
		return new Manager(this.db, (this.parent ? this.parent + '.' : '') + key)
	}

	/**
	 * Builds the full dot-separated path for `key`, combining it with this
	 * manager's own namespace (`this.parent`). Returns null for the root path.
	 */
	fullPath(key) {
		if(this.parent && key) return this.parent + '.' + key
		return this.parent || key || null
	}

	// Access
	get(key) {
		return getPath(this.db, this.fullPath(key))
	}
	set(key, value) {
		return setPath(this.db, this.fullPath(key), value)
	}
	delete(key) {
		return deletePath(this.db, this.fullPath(key))
	}

	// Collections
	keys() {
		return Object.keys(this.get(null) || {})
	}
	has(key) {
		return this.get(key) !== undefined
	}

	/**
	 * Loads the database content from disk (gzip-compressed JSON), replacing the
	 * in-memory content. Does nothing if the file does not exist yet.
	 */
	load(path) {
		if(!existsSync(path)) return
		const compressed = readFileSync(path)
		const data = compressed.length ? JSON.parse(gunzipSync(compressed).toString('utf8')) : {}
		for(const key in this.db) delete this.db[key]
		Object.assign(this.db, data)
	}

	/**
	 * Persists the current in-memory database content to disk, gzip-compressed.
	 */
	save(path) {
		console.log('Saving database to', path)
		mkdirSync(dirname(path), {recursive: true})
		writeFileSync(path, gzipSync(JSON.stringify(this.db)))
	}
}

const DB = new Manager({})
DB.load(CONFIG.DB_PATH)

// every 15minutes, save the database to disk
setInterval(() => {
	DB.save(CONFIG.DB_PATH)
}, 15 * 60 * 1000).unref()

export default DB
export { Manager }
