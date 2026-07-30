import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { load as loadYaml } from 'js-yaml'
import axios from 'axios'
import { openSqlite } from '../server/data/sqliteDb.js'
import { processImageUpload } from '../server/services/entryImageService.js'
import { Entry } from '../server/model/entriesModel.js'
import CONFIG from '../server/config/config.js'

const PROJECT_ROOT = resolve(import.meta.dirname + '/../..')

/**
 * CLI prompt: node has no global prompt() (that's a browser-only API), so
 * this reads a single line from stdin via readline/promises instead.
 */
async function prompt(question) {
	const rl = createInterface({input: process.stdin, output: process.stdout})
	try {
		return await rl.question(question + ' ')
	} finally {
		rl.close()
	}
}

/** Resolves a config-file-relative path the same way src/server/config/config.js's p() does. */
function resolveConfigPath(p) {
	return p.startsWith('./') ? resolve(p.replace('./', PROJECT_ROOT + '/')) : resolve(p)
}

/**
 * Loads sqlitePath/dataDir from the server's YAML config file. Read directly
 * (not via src/server/config/config.js) since that module resolves its file
 * from an --env= name, not from an arbitrary path given on the command line.
 */
function loadServerConfig(configPath) {
	const raw = loadYaml(readFileSync(configPath, 'utf8'))
	return {
		sqlitePath: resolveConfigPath(raw.sqlitePath || './data/nanking.sqlite'),
		dataDir: resolveConfigPath(raw.dataDir || './data'),
	}
}

/** Mirrors entryImageService.js's getEntryImageFilePath, parameterized by an explicit dataDir. */
function getEntryImageFilePath(dataDir, entryId) {
	return dataDir + '/entryImages/' + entryId.replace(':', '/') + '.png'
}

/**
 * Downloads and converts `imageUrl` into a 200x200 PNG (processImageUpload,
 * same pipeline as a user upload), then writes it at entryId's expected
 * location. Does nothing if the file already exists (idempotent, independent
 * of whether this entry ends up actually imported), or if the download/decode
 * fails - a broken poster must never abort the whole import.
 */
async function ensureEntryImage(dataDir, entryId, imageUrl) {
	const filePath = getEntryImageFilePath(dataDir, entryId)
	if(existsSync(filePath)) return
	if(!imageUrl) return

	let pngBuffer
	try {
		const response = await axios.get(imageUrl, {responseType: 'arraybuffer'})
		pngBuffer = await processImageUpload(Buffer.from(response.data))
	} catch (err) {
		console.warn('Image download/conversion failed for', imageUrl, '-', err.message)
		return
	}

	mkdirSync(dirname(filePath), {recursive: true})
	await writeFile(filePath, pngBuffer)
}

/**
 * Fetches every anime `username` watched+scored on MAL. For each one, kicks
 * off ensureEntryImage() right away (independent of any later filtering
 * against SQLite) and collects the promise in `imagePromises` since
 * callMALuserAPI's callback isn't awaited. Returns the raw candidate list
 * ({entryId, name, score}); image completion is awaited separately by the
 * caller via Promise.all(imagePromises).
 */
function fetchMALCandidates(username, clientId, dataDir, imagePromises) {
	const candidates = []
	return new Promise((resolveList) => {
		callMALuserAPI(username, clientId, 0, (animeData) => {
			// If anime is not watched or not scored, skip it
			if(animeData.watched_episodes < 1 || !animeData.score) return

			const entryId = 'mal:' + animeData.mal_id
			candidates.push({entryId, name: animeData.title, score: animeData.score})
			imagePromises.push(ensureEntryImage(dataDir, entryId, animeData.image_url))
		}, () => resolveList(candidates))
	})
}

function callMALuserAPI(username, clientId, offset, cb, onEnd) {
	const d = new Date()
	const limit = 100
	const fields = 'list_status,num_episodes,mean,genres,start_date,end_date,media_type,main_picture,rating'
	const url = 'https://api.myanimelist.net/v2/users/' + encodeURIComponent(username)
		+ '/animelist?offset=' + offset + '&limit=' + limit
		+ '&fields=' + encodeURIComponent(fields) + '&sort=list_score'

	console.info('GET', url)
	axios.get(url, {
		accept: 'application/json',
		headers: {
			'X-MAL-CLIENT-ID': clientId,
		},
	}).then((response) => {
		if(response?.data?.data?.length) {
			console.info('Success', url, (new Date() - d) + 'ms')

			// Transform MAL API v2 response to match expected format
			for(const item of response.data.data) {
				cb({
					mal_id: item.node.id,
					title: item.node.title,
					image_url: item.node.main_picture?.large,
					type: item.node.media_type,
					score: item.list_status?.score,
					watched_episodes: item.list_status?.num_episodes_watched,
					totalEpisodes: item.node.num_episodes,
					rating: item.node.rating,
					start_date: item.node.start_date,
					end_date: item.node.end_date,
					genres: item.node.genres,
					tags: item.list_status?.tags || [],
				})
			}

			// Continue pagination if there are more results
			if(response.data.paging?.next) {
				setTimeout(() => callMALuserAPI(username, clientId, offset + limit, cb, onEnd), 1000)
			} else {
				onEnd()
			}
		} else {
			console.warn('No data', url, (new Date() - d) + 'ms')
			console.log(response.data)
			onEnd()
		}
	}).catch((error) => {
		if(!error?.response?.status) {
			console.error((new Date() - d) + 'ms', 'MAL returned Error', error)
		} else {
			console.warn(
				(new Date() - d) + 'ms', 'MAL returned Error',
				error.response.status, error.response.statusText, ':', error.response.data.message,
			)
		}
		onEnd()
	})
}

async function main(configPath, username, malClientId, usernameNanking) {
	configPath = configPath
		|| await prompt('Please enter the path to the server config file (e.g. conf/conf.local.yml)')
	username = username || await prompt('Please enter your MAL username')
	malClientId = malClientId
		|| await prompt('Please enter your MAL Client ID (get this from https://myanimelist.net/apiconfig)')
	usernameNanking = usernameNanking || username

	const {sqlitePath, dataDir} = loadServerConfig(configPath)

	// Phase 1: MAL pagination + image download/conversion, no SQLite access yet
	console.log('Fetching MAL list for', username, '...')
	const imagePromises = []
	const candidates = await fetchMALCandidates(username, malClientId, dataDir, imagePromises)
	await Promise.all(imagePromises)
	console.log('Fetched', candidates.length, 'scored/watched entries.')

	// Phase 2: read-only lookups, to build an accurate summary
	const sqlite = await openSqlite(sqlitePath)
	const topicId = CONFIG.DEFAULT_TOPIC
	const ids = candidates.map((c) => c.entryId)
	const placeholders = ids.map(() => '?').join(',')
	const existingEntryIds = new Set(
		ids.length
			? (await sqlite.all(
				`SELECT id FROM entries WHERE topic_id = ? AND id IN (${placeholders})`, [topicId, ...ids]
			)).map((r) => r.id)
			: []
	)
	const existingQuizEntryIds = new Set(
		ids.length
			? (await sqlite.all(
				`SELECT entry_id FROM direct_quiz WHERE topic_id = ? AND username = ? AND entry_id IN (${placeholders})`,
				[topicId, usernameNanking, ...ids]
			)).map((r) => r.entry_id)
			: []
	)
	const existingAccount = await sqlite.get('SELECT 1 FROM accounts WHERE username = ?', [usernameNanking])

	const toCreateEntries = candidates.filter((c) => !existingEntryIds.has(c.entryId))
	const toCreateQuiz = candidates.filter((c) => !existingQuizEntryIds.has(c.entryId))

	// Phase 3: summary + interactive confirmation - no write happens before a "yes"
	console.log('Summary:')
	console.log(
		`  Nanking account "${usernameNanking}": `
		+ (existingAccount ? 'already exists' : 'will be newly created (ghost account)')
	)
	console.log(`  ${toCreateEntries.length} new entries will be created`)
	console.log(`  ${toCreateQuiz.length} new direct quiz votes will be created`)
	console.log(`  ${candidates.length - toCreateQuiz.length} entries already scored, left untouched`)

	if(toCreateEntries.length === 0 && toCreateQuiz.length === 0) {
		console.log('Nothing to import.')
		await sqlite.close()
		return
	}

	const answer = await prompt('Proceed with the import? (yes/no)')
	if(!/^y(es)?$/i.test(answer.trim())) {
		console.log('Aborted, nothing was written to the database (downloaded images, if any, were kept on disk).')
		await sqlite.close()
		return
	}

	// Phase 4: short, strictly synchronous SQL transaction - only reached after confirmation
	let createdEntries = 0
	let createdQuiz = 0
	await sqlite.transaction(() => {
		const db = sqlite.db

		db.prepare(
			'INSERT OR IGNORE INTO accounts (username, display_login, password_hash, salt) VALUES (?, ?, NULL, NULL)'
		).run(usernameNanking, usernameNanking)

		const insertEntry = db.prepare('INSERT OR IGNORE INTO entries (topic_id, id, name, image) VALUES (?, ?, ?, ?)')
		for(const candidate of toCreateEntries) {
			new Entry(candidate.entryId, candidate.name) // throws if the id format is somehow invalid
			const imagePath = existsSync(getEntryImageFilePath(dataDir, candidate.entryId))
				? '/entryImages/' + candidate.entryId.replace(':', '/') + '.png'
				: 'assets/unknown.svg'
			createdEntries += insertEntry.run(topicId, candidate.entryId, candidate.name, imagePath).changes
		}

		const insertQuiz = db.prepare(
			'INSERT OR IGNORE INTO direct_quiz (topic_id, username, entry_id, value, ts) VALUES (?, ?, ?, ?, ?)'
		)
		for(const candidate of toCreateQuiz) {
			createdQuiz += insertQuiz.run(
				topicId, usernameNanking, candidate.entryId, (candidate.score - 1) / 9, Date.now()
			).changes
		}
	})

	console.log('Done:', createdEntries, 'entries created,', createdQuiz, 'direct quiz votes created.')
	await sqlite.close()
}


// Parse arguments
const args = process.argv.slice(2) // node src/scripts/MALtoSQLite.js configPath username malClientId [usernameNanking]
await main(...args)
