import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type House, type HouseItem, type HouseNode } from '../lib/api'

// The house on a computer: the tree on the left, the selected place on the
// right, and "Find anything" across every item. Reads the same /api/house
// data as the phone's House view.

interface Placed {
  item: HouseItem & { location_note?: string }
  path: HouseNode[] // room first; empty for things outside the house tree
}

const visibleItems = (node: HouseNode) => node.items.filter((it) => !it.also_a_place)
const countInside = (node: HouseNode): number => visibleItems(node).length + node.children.reduce((n, c) => n + countInside(c), 0)

/** Every item with the chain of places holding it. */
function everything(house: House): Placed[] {
  const out: Placed[] = []
  const walk = (node: HouseNode, path: HouseNode[]) => {
    for (const item of visibleItems(node)) out.push({ item, path: [...path, node] })
    for (const child of node.children) walk(child, [...path, node])
  }
  for (const room of house.rooms) walk(room, [])
  for (const item of house.elsewhere) out.push({ item, path: [] })
  return out
}

function findPath(nodes: HouseNode[], id: string, trail: HouseNode[] = []): HouseNode[] | null {
  for (const n of nodes) {
    if (n.id === id) return [...trail, n]
    const deeper = findPath(n.children, id, [...trail, n])
    if (deeper) return deeper
  }
  return null
}

function itemExtras(item: HouseItem & { location_note?: string }): string[] {
  return [
    item.quantity && item.quantity > 1 ? `×${item.quantity}` : '',
    item.status !== 'present' ? `${item.status}${item.lent_to ? ` to ${item.lent_to}` : ''}` : '',
    ...(item.details ?? []).map((d) => `${d.key}: ${d.value}`),
    item.location_note ?? '',
  ].filter(Boolean)
}

const address = (path: HouseNode[]) => path.map((p) => (p.position ? `${p.name} (${p.position})` : p.name)).join(' › ')

export default function HouseExplorer() {
  const [house, setHouse] = useState<House | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [tidying, setTidying] = useState(false)

  const load = useCallback(() => {
    api.house().then(setHouse, (e) => setError(String(e.message ?? e)))
  }, [])
  useEffect(load, [load])

  const all = useMemo(() => (house ? everything(house) : []), [house])
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return all.filter(({ item }) =>
      [item.name, ...(item.aliases ?? []), ...(item.details ?? []).map((d) => d.value)].some((t) => t.toLowerCase().includes(q)),
    )
  }, [all, query])

  if (error) return <p className="error">{error}</p>
  if (!house) return <p className="hint">Loading…</p>

  const selectedPath = selected ? findPath(house.rooms, selected) : null
  const place = selectedPath ? selectedPath[selectedPath.length - 1] : null
  const pending = (house.status.pending_compaction ?? 0) + (house.status.error ?? 0)

  /** Select a place and open every level above it in the tree. */
  const select = (id: string) => {
    const path = findPath(house.rooms, id) ?? []
    setOpen((prev) => new Set([...prev, ...path.map((p) => p.id)]))
    setSelected(id)
    setQuery('')
  }
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const renderTree = (nodes: HouseNode[], depth: number) =>
    nodes.map((n) => {
      const hasChildren = n.children.length > 0
      const isOpen = open.has(n.id)
      return (
        <li key={n.id}>
          <div className={selected === n.id ? 'xtree-row selected' : 'xtree-row'} style={{ paddingLeft: 8 + depth * 16 }}>
            <button
              className="xtree-chevron"
              aria-label={isOpen ? `Close ${n.name}` : `Open ${n.name}`}
              aria-expanded={hasChildren ? isOpen : undefined}
              disabled={!hasChildren}
              onClick={() => toggle(n.id)}
            >
              <span className={`chevron${hasChildren ? ' has' : ''}${isOpen ? ' open' : ''}`} aria-hidden />
            </button>
            <button className="xtree-name" aria-current={selected === n.id} onClick={() => select(n.id)}>
              <span className={depth === 0 ? 'room-name' : ''}>{n.name}</span>
              <span className="xtree-count">{countInside(n) || ''}</span>
            </button>
          </div>
          {hasChildren && isOpen && <ul>{renderTree(n.children, depth + 1)}</ul>}
        </li>
      )
    })

  return (
    <div className="explorer">
      <div className="explorer-bar">
        <input
          className="find"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find anything — an item, a brand, a color"
          aria-label="Find anything"
        />
        <span className="hint">
          {all.length} things in {house.rooms.length} rooms
          {pending > 0 && ` · ${pending} not filed yet`}
        </span>
        {pending > 0 && (
          <button
            className="ghost"
            disabled={tidying}
            onClick={async () => {
              setTidying(true)
              try {
                await api.compact()
                load()
              } finally {
                setTidying(false)
              }
            }}
          >
            {tidying ? 'Tidying…' : 'Tidy up now'}
          </button>
        )}
      </div>

      <div className="explorer-panes">
        <nav className="xtree" aria-label="Places">
          {house.rooms.length ? <ul>{renderTree(house.rooms, 0)}</ul> : <p className="hint">Nothing filed yet. Use Talk, or the app on your phone.</p>}
          {house.elsewhere.length > 0 && (
            <p className="hint xtree-elsewhere">
              {house.elsewhere.length} {house.elsewhere.length === 1 ? 'thing is' : 'things are'} outside the house — search to find {house.elsewhere.length === 1 ? 'it' : 'them'}.
            </p>
          )}
        </nav>

        <section className="xdetail" aria-live="polite">
          {query.trim() ? (
            <>
              <h2>
                {results.length} {results.length === 1 ? 'match' : 'matches'} for “{query.trim()}”
              </h2>
              <ul className="xresults">
                {results.map(({ item, path }) => (
                  <li key={item.id}>
                    <button className="xresult" disabled={!path.length} onClick={() => path.length && select(path[path.length - 1].id)}>
                      <span className="iname">{item.name}</span>
                      <span className="where">{path.length ? address(path) : item.location_note ?? (item.lent_to ? `lent to ${item.lent_to}` : 'outside the house')}</span>
                      {/* Outside the house, "where" already says it's lent or noted — don't repeat it. */}
                      {(path.length ? itemExtras(item) : itemExtras({ ...item, status: 'present', location_note: undefined })).length > 0 && (
                        <span className="extra">
                          {(path.length ? itemExtras(item) : itemExtras({ ...item, status: 'present', location_note: undefined })).join(' · ')}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : place && selectedPath ? (
            <>
              {selectedPath.length > 1 && (
                <p className="crumbs">
                  {selectedPath.slice(0, -1).map((p) => (
                    <span key={p.id}>
                      <button className="link-button" onClick={() => select(p.id)}>
                        {p.name}
                      </button>
                      {' › '}
                    </span>
                  ))}
                </p>
              )}
              <h2>
                {place.name} {place.position && <span className="tree-node-type position">{place.position}</span>}
              </h2>
              <p className="hint">
                {place.kind}
                {place.aliases?.length ? ` · also called ${place.aliases.join(', ')}` : ''}
                {place.description ? ` · ${place.description}` : ''}
              </p>
              <h3>{visibleItems(place).length ? 'In it' : 'Nothing directly in it'}</h3>
              {visibleItems(place).length > 0 && (
                <table className="xitems">
                  <tbody>
                    {visibleItems(place).map((it) => (
                      <tr key={it.id}>
                        <td className="iname">{it.name}</td>
                        <td className="extra">{itemExtras(it).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {place.children.length > 0 && (
                <>
                  <h3>Places inside</h3>
                  <ul className="xchildren">
                    {place.children.map((c) => (
                      <li key={c.id}>
                        <button className="xresult" onClick={() => select(c.id)}>
                          <span className="iname">
                            {c.name} {c.position && <span className="tree-node-type position">{c.position}</span>}
                          </span>
                          <span className="where">
                            {countInside(c)} {countInside(c) === 1 ? 'thing' : 'things'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            <div className="xempty">
              <h2>Pick a place, or find something</h2>
              <p className="hint">Choose a room on the left to see what’s in it, or type in Find to search every item in the house.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
