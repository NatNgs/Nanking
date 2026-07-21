import DB from './db.js'
import ENTRIES from './entries.js'

// Matches a tag id, e.g. 't:0' or 't:12'
const TAG_ID_FORMAT = /^t:[a-z0-9_.-]+$/

class Tag {
	constructor(id, label) {
		if(!TAG_ID_FORMAT.test(id)) {
			throw new Error(`Identifiant de tag invalide : ${id}`)
		}
		this.id = id
		this.label = label
		this.parents = [] // ids of more generic tags this tag inherits from (e.g. "Chat".parents = ["Animal"])
		this.score = 0.5 // All-users-combined computed score, never persisted
	}
}
class TagsManager {
	constructor(db) {
		this.db = db.sub('tags')
		this.tags = {} // id: Tag

		// Load tags from db
		for(const tagId of this.db.keys()) {
			try {
				const data = this.db.get(tagId)
				const tag = new Tag(tagId, data.label)
				if(Array.isArray(data.parents)) tag.parents = data.parents.slice()
				this.tags[tagId] = tag
			} catch(err) {
				console.error(`Impossible de charger le tag '${tagId}' :`, err.message)
			}
		}
		// Second pass: drop any parent id that ended up not loading (invalid id,
		// corrupted entry, ...), so `parents` never points into the void.
		for(const tagId in this.tags) {
			this.tags[tagId].parents = this.tags[tagId].parents.filter((parentId) => this.tags[parentId])
		}
	}

	getTagByLabel(label, createIfNotExists=false) {
		label = label.trim()

		for(const tagId in this.tags) {
			const tag = this.tags[tagId]
			if(tag.label === label) return tag
		}
		if(!createIfNotExists) return null

		// Not found: Create a new tag
		let key = Object.keys(this.tags).length
		while(this.tags['t:' + key] !== undefined) key++
		const tag = new Tag('t:' + key, label)
		this.tags[tag.id] = tag

		return tag
	}
	/**
	 * Looks for a tag whose label matches `label` case-insensitively, skipping
	 * `excludeTagId` (typically the tag being renamed, so it never conflicts with itself).
	 */
	getTagByLabelIgnoreCase(label, excludeTagId=null) {
		const lower = label.trim().toLowerCase()
		for(const tagId in this.tags) {
			if(tagId === String(excludeTagId)) continue
			if(this.tags[tagId].label.toLowerCase() === lower) return this.tags[tagId]
		}
		return null
	}
	searchTag(searchInput) {
		const regex = new RegExp(searchInput.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\s+/g, '\\s+'), 'i')
		const result = []
		for(const tagId in this.tags) {
			const tag = this.tags[tagId]
			if(regex.test(tag.label)) result.push(tag)
		}
		result.sort((a, b) => a.label.length - b.label.length)
		if(result.length > 32) result.length = 32
		return result
	}

	getTagById(id) {
		return this.tags[id]
	}

	getGlobalScores() {
		const scores = {}
		for(const tagId in this.tags) {
			scores[tagId] = this.tags[tagId].score
		}
		return scores
	}

	/**
	 * Set of tagId + every more generic tag it transitively inherits from
	 * (its whole `parents` closure). Iterative DFS.
	 */
	getAncestors(tagId) {
		const visited = new Set([tagId])
		const stack = [tagId]
		while(stack.length) {
			const current = stack.pop()
			const tag = this.tags[current]
			if(!tag) continue
			for(const parentId of tag.parents) {
				if(!visited.has(parentId)) {
					visited.add(parentId)
					stack.push(parentId)
				}
			}
		}
		return visited
	}

	/**
	 * Set of tagId + every more specific tag that transitively has it as an
	 * ancestor (the reverse relation, derived from `parents`). Iterative DFS.
	 */
	getDescendants(tagId) {
		const visited = new Set([tagId])
		const stack = [tagId]
		while(stack.length) {
			const current = stack.pop()
			for(const otherId in this.tags) {
				if(this.tags[otherId].parents.includes(current) && !visited.has(otherId)) {
					visited.add(otherId)
					stack.push(otherId)
				}
			}
		}
		return visited
	}

	/**
	 * Direct children of `tagId`: every tag having `tagId` in its own `parents`
	 * list. Derived relation, never stored.
	 */
	getDirectChildren(tagId) {
		const result = []
		for(const otherId in this.tags) {
			if(this.tags[otherId].parents.includes(tagId)) result.push(this.tags[otherId])
		}
		return result
	}

	/**
	 * True if adding `newParentId` as a parent of `tagId` would create a cycle:
	 * either it's a self-reference, or `tagId` is already an ancestor of
	 * `newParentId` (i.e. there is already a `newParentId -> ... -> tagId`
	 * chain of parents, which the new edge `tagId -> newParentId` would close
	 * into a loop).
	 */
	wouldCreateCycle(tagId, newParentId) {
		if(tagId === newParentId) return true
		return this.getAncestors(newParentId).has(tagId)
	}

	/**
	 * Adds `newParentId` as a parent of `tagId`. Returns
	 * 'not_found' (either tag doesn't exist) | 'cycle' | 'conflict' (already a parent) | 'ok'.
	 */
	addParent(tagId, newParentId) {
		const tag = this.tags[tagId]
		const newParent = this.tags[newParentId]
		if(!tag || !newParent) return 'not_found'
		if(tag.parents.includes(newParentId)) return 'conflict'
		if(this.wouldCreateCycle(tagId, newParentId)) return 'cycle'
		tag.parents.push(newParentId)
		return 'ok'
	}

	/**
	 * Removes `parentIdToRemove` from tagId's parents list. Returns
	 * 'not_found' | 'ok'. Idempotent: removing an absent link is still 'ok'.
	 */
	removeParent(tagId, parentIdToRemove) {
		const tag = this.tags[tagId]
		if(!tag) return 'not_found'
		const idx = tag.parents.indexOf(parentIdToRemove)
		if(idx !== -1) tag.parents.splice(idx, 1)
		return 'ok'
	}

	/**
	 * Tag ids sorted from the most specific (no derived children) to the most
	 * generic (roots), using Kahn's algorithm on the derived "tag -> its direct
	 * children" graph. Used by scoresComputerService to compute tag scores in
	 * the right order: a tag is only computed once all its direct children are.
	 */
	topologicalOrder() {
		// remaining[tagId] = number of direct children of tagId not yet placed
		const remaining = {}
		for(const tagId in this.tags) remaining[tagId] = this.getDirectChildren(tagId).length

		const queue = Object.keys(this.tags).filter((id) => remaining[id] === 0)
		const order = []
		const done = new Set()

		while(queue.length) {
			const tagId = queue.shift()
			if(done.has(tagId)) continue
			done.add(tagId)
			order.push(tagId)

			// This tag is now fully placed: decrement the remaining count of
			// every tag that has it as a parent (i.e. every tag it unblocks).
			const tag = this.tags[tagId]
			for(const parentId of tag.parents) {
				if(done.has(parentId)) continue
				remaining[parentId]--
				if(remaining[parentId] === 0) queue.push(parentId)
			}
		}

		// Defense in depth: if a cycle somehow survived (DB corruption), append
		// the remaining tags in arbitrary order rather than blocking the whole
		// score computation.
		for(const tagId in this.tags) {
			if(!done.has(tagId)) order.push(tagId)
		}

		return order
	}

	save() {
		// A tag with no relation at all (no parent, no derived child, not used by
		// any entry) is simply left out of the persisted DB: it stops existing
		// on the next load, instead of exposing a dedicated delete route.
		const json = {}
		for(const tagId in this.tags) {
			const tag = this.tags[tagId]
			if(tag.parents.length === 0 && this.getDirectChildren(tagId).length === 0 && !this._isUsedByAnyEntry(tagId)) {
				continue
			}
			json[tag.id] = {label: tag.label, parents: tag.parents}
		}
		this.db.set(null, json)
	}

	_isUsedByAnyEntry(tagId) {
		for(const entryId in ENTRIES.entries) {
			if(ENTRIES.entries[entryId].tags.includes(tagId)) return true
		}
		return false
	}
}

const TAGS = new TagsManager(DB)
export default TAGS
export { TagsManager, Tag }
