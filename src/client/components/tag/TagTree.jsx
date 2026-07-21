import TagSpan from './TagSpan.jsx'
import './TagTree.css'

/**
 * Generic 2-level tag tree, used for both the parents and children display on
 * TagPage. `nodes` are the level-1 tags; each may carry a `node[childKey]`
 * array of level-2 tags (rendered read-only). `onRemove`, when provided, adds
 * a [x] button on level-1 nodes only.
 */
function TagTree({title, nodes, childKey, onRemove}) {
	return (
		<div className="tag-tree">
			<h3>{title}</h3>
			{nodes.length === 0 && <p className="tag-tree-empty">None</p>}
			<ul>
				{nodes.map((node) => (
					<li key={node.id}>
						<TagSpan id={node.id} label={node.label} />
						{onRemove && <button onClick={() => onRemove(node.id)}>x</button>}
						{node[childKey]?.length > 0 && (
							<ul>
								{node[childKey].map((sub) => (
									<li key={sub.id}><TagSpan id={sub.id} label={sub.label} /></li>
								))}
							</ul>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}

export default TagTree
