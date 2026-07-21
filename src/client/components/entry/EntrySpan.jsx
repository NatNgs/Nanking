import { Link } from 'react-router'
import './EntrySpan.css'

/**
 * Pastille linking to an entry's page, used everywhere an entry is referenced
 * (score tables, votes, tag pages, ...).
 */
function EntrySpan({id, label, title}) {
	return <Link className="entryLabel" to={'/entry/' + id} title={title}>{label}</Link>
}

export default EntrySpan
