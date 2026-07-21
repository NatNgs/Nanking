import { Link } from 'react-router'
import './TagSpan.css'

/**
 * Pastille linking to a tag's page, used everywhere a tag is referenced
 * (entry pages, tag trees, ...).
 */
function TagSpan({id, label, title}) {
	return <Link className="tagLabel" to={'/tag/' + id} title={title}>{label}</Link>
}

export default TagSpan
