class QuizError extends Error {
	constructor(message) {
		super(message)
		this.name = 'QuizError'
	}
}

class AbstractQuiz {
	constructor(type) {
		this._type = type
	}
	get type() {
		return this._type
	}
	apply(currentScores, outputEntriesLists) {
		throw Error('Calling apply on AbstractQuiz')
	}
	equals(other) {
		throw Error('Calling equals on AbstractQuiz')
	}
	toJson() {
		throw Error('Calling save on AbstractQuiz')
	}
}

class DirectQuiz extends AbstractQuiz {
	constructor(entry, value) {
		if(!entry) {
			throw new QuizError('Direct: entry cannot be null')
		}
		if(value < 0 || value > 1) {
			throw new QuizError('Direct: value must be between 0 and 1')
		}
		super('direct')

		this.entry = entry
		this.value = value
	}

	apply(currentScores, outputEntriesLists) {
		if(!outputEntriesLists[this.entry.id])
			outputEntriesLists[this.entry.id] = []
		outputEntriesLists[this.entry.id].push(this.value)
	}
	// Compares by entry id, not object identity: entries are reloaded fresh
	// from SQLite on demand (no long-lived cache - see entriesRepository.js),
	// so two DirectQuiz instances referencing "the same" entry never share
	// the same Entry object instance.
	equals(other) {
		return this.type === other.type && this.entry.id === other.entry.id
	}
	referencesEntry(entry) {
		return this.entry.id === entry.id
	}
	toJson() {
		return {
			type: this.type,
			entry: this.entry.id,
			value: this.value,
		}
	}
}

class DualQuiz extends AbstractQuiz {
	constructor(neg, pos, value) {
		if(!neg || !pos) {
			throw new QuizError('Dual: entries cannot be null')
		}
		if(neg.id === pos.id) {
			throw new QuizError('Dual: cannot compare between the same entry')
		}
		if(value < -1 || value > 1) {
			throw new QuizError('Dual: value must be between -1 and 1')
		}
		super('dual')

		this.neg = neg
		this.pos = pos
		this.value = value
	}

	apply(currentScores, outputEntriesLists) {
		if(!outputEntriesLists[this.neg.id]) outputEntriesLists[this.neg.id] = []
		if(!outputEntriesLists[this.pos.id]) outputEntriesLists[this.pos.id] = []

		// if value is 0, push to both entries the average between their user values (or 0.5 if no current user value)
		const negValue = currentScores[this.neg.id] || 0.5
		const posValue = currentScores[this.pos.id] || 0.5
		if(this.value === 0) {
			const average = (negValue + posValue) / 2
			outputEntriesLists[this.neg.id].push(average)
			outputEntriesLists[this.pos.id].push(average)
		} else if(this.value > 0) { // Vote in favor of pos
			if(negValue <= posValue) { // Pos is already favorized, push both a bit more appart to eachother
				outputEntriesLists[this.neg.id].push(negValue - 0.025)
				outputEntriesLists[this.pos.id].push(posValue + 0.025)
			} else { // Neg is currently favorite. Give pos score to neg and neg score to pos, with a little complementary push
				outputEntriesLists[this.neg.id].push(posValue - 0.025)
				outputEntriesLists[this.pos.id].push(negValue + 0.025)
			}
		} else if(this.value < 0) { // Vote in favor of neg
			if(negValue >= posValue) { // Neg is already favorized
				outputEntriesLists[this.neg.id].push(negValue + 0.025)
				outputEntriesLists[this.pos.id].push(posValue - 0.025)
			} else { // Pos is currently favorite. Give pos score to neg and neg score to pos, with a little complementary push
				outputEntriesLists[this.neg.id].push(posValue + 0.025)
				outputEntriesLists[this.pos.id].push(negValue - 0.025)
			}
		}
	}
	// Compares by entry id, not object identity - see DirectQuiz.equals()'s
	// comment for why.
	equals(other) {
		return this.type === other.type
			&& (
				(this.neg.id === other.neg.id && this.pos.id === other.pos.id)
				|| (this.neg.id === other.pos.id && this.pos.id === other.neg.id)
			)
	}
	referencesEntry(entry) {
		return this.neg.id === entry.id || this.pos.id === entry.id
	}
	toJson() {
		return {
			type: this.type,
			neg: this.neg.id,
			pos: this.pos.id,
			value: this.value,
		}
	}
}


export { DirectQuiz, DualQuiz }
