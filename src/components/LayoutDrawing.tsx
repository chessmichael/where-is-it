import type { HouseNode } from '../lib/api'

// A piece of furniture drawn from its parts' layout cells (rows from the top,
// columns from the left) — the same arrangement the agent stores and draws.
// Parts without a cell are listed underneath.

const visible = (node: HouseNode) => node.items.filter((it) => !it.also_a_place)
const inside = (node: HouseNode): string[] => [...visible(node).map((it) => it.name), ...node.children.flatMap(inside)]

export function hasLayout(node: HouseNode) {
  return node.children.some((c) => c.grid)
}

export default function LayoutDrawing({ node, onPick }: { node: HouseNode; onPick?: (id: string) => void }) {
  const parts = node.children.filter((c) => c.grid)
  if (!parts.length) return null
  const rows = Math.max(...parts.map((p) => p.grid!.row + p.grid!.rows - 1))
  const cols = Math.max(...parts.map((p) => p.grid!.col + p.grid!.cols - 1))
  const loose = node.children.filter((c) => !c.grid)
  return (
    <figure className="layout">
      <div
        className="layout-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }}
        role="group"
        aria-label={`How the ${node.name.toLowerCase()} is laid out`}
      >
        {parts.map((p) => {
          const things = inside(p)
          const body = (
            <>
              <span className="layout-part">{p.name}</span>
              {things.length > 0 && <span className="layout-things">{things.join(', ')}</span>}
            </>
          )
          const style = { gridRow: `${p.grid!.row} / span ${p.grid!.rows}`, gridColumn: `${p.grid!.col} / span ${p.grid!.cols}` }
          return onPick ? (
            <button key={p.id} className="layout-cell" style={style} onClick={() => onPick(p.id)}>
              {body}
            </button>
          ) : (
            <div key={p.id} className="layout-cell" style={style}>
              {body}
            </div>
          )
        })}
      </div>
      {loose.length > 0 && <figcaption className="hint">Not placed in the drawing yet: {loose.map((c) => c.name).join(', ')}</figcaption>}
    </figure>
  )
}
