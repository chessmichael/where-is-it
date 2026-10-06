import { useCallback, useEffect, useState } from 'react'
import { api, type House, type HouseItem, type HouseNode } from '../lib/api'
import { shownDetails } from '../lib/details'
import LayoutDrawing from './LayoutDrawing'
import { RedoPlace, SavedCopies } from './Redo'

// Read-only view of the compacted house (layer 2), plus what's still waiting
// in the inbox and any open questions from the agent.

function ItemRow({ item }: { item: HouseItem & { location_note?: string } }) {
  const extra = [
    item.quantity && item.quantity > 1 ? `×${item.quantity}` : '',
    item.status !== 'present' ? `${item.status}${item.lent_to ? ` to ${item.lent_to}` : ''}` : '',
    ...shownDetails(item.details),
  ].filter(Boolean)
  return (
    <li className="tree-item">
      <span className="tree-item-name">
        {item.name}
        {extra.length > 0 && <span className="tree-item-loc"> · {extra.join(' · ')}</span>}
        {item.location_note && <span className="tree-item-loc"> — {item.location_note}</span>}
      </span>
    </li>
  )
}

/** Everything inside a place, counted all the way down (for "Garage · 23 things"). */
function countInside(node: HouseNode): number {
  return visibleItems(node).length + node.children.reduce((n, c) => n + countInside(c), 0)
}

/** Items that are also a place (a toolbox, a tote) show as the place itself, not twice. */
function visibleItems(node: HouseNode) {
  return node.items.filter((it) => !it.also_a_place)
}

const OPEN_KEY = 'whi.house.open'
function loadOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

export function Place({ node, depth, open, toggle, onRedone }: { node: HouseNode; depth: number; open: Set<string>; toggle: (id: string) => void; onRedone?: (message: string) => void }) {
  const isOpen = open.has(node.id)
  const items = visibleItems(node)
  const count = countInside(node)
  const hasInside = items.length + node.children.length > 0
  const Heading = depth === 0 ? 'h3' : 'div'
  return (
    <div className={depth === 0 ? 'place room' : 'place'}>
      <Heading className="place-heading">
        <button
          className="place-toggle"
          aria-expanded={hasInside ? isOpen : undefined}
          disabled={!hasInside}
          onClick={() => toggle(node.id)}
        >
          <span className={`chevron${hasInside ? ' has' : ''}${isOpen ? ' open' : ''}`} aria-hidden />
          {/* Name with its position underneath, so a long position wraps instead of widening the page. */}
          <span className="place-label">
            <span className="place-name">{node.name}</span>
            {node.position && <span className="place-position">{node.position}</span>}
          </span>
          <span className="place-count">{count === 0 ? 'empty' : `${count} ${count === 1 ? 'thing' : 'things'}`}</span>
        </button>
      </Heading>
      {isOpen && (
        <div className="place-inside">
          {node.description && <p className="tree-node-desc">{node.description}</p>}
          <LayoutDrawing node={node} />
          {items.length > 0 && (
            <ul className="tree-items">
              {items.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          )}
          {node.children.map((c) => (
            <Place key={c.id} node={c} depth={depth + 1} open={open} toggle={toggle} onRedone={onRedone} />
          ))}
          {onRedone && hasInside && <RedoPlace id={node.id} name={node.name} onDone={onRedone} />}
        </div>
      )}
    </div>
  )
}

function allIds(nodes: HouseNode[]): string[] {
  return nodes.flatMap((n) => [n.id, ...allIds(n.children)])
}

export default function HouseTree() {
  const [house, setHouse] = useState<House | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tidying, setTidying] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [redoMessage, setRedoMessage] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(loadOpen)

  const remember = (next: Set<string>) => {
    setOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
    } catch {
      // Not remembering which places were open is fine.
    }
  }
  const toggle = (id: string) => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    remember(next)
  }

  const load = useCallback(() => {
    api.house().then(setHouse, (e) => setError(String(e.message ?? e)))
  }, [])
  useEffect(load, [load])

  async function tidy() {
    setTidying(true)
    setSummary(null)
    try {
      const r = await api.compact()
      setSummary(r.runs.map((x) => x.summary).join(' ') || 'Nothing to tidy.')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setTidying(false)
    }
  }

  if (error) return <p className="error">{error}</p>
  if (!house) return <p className="hint">Loading…</p>

  const pending = (house.status.pending_compaction ?? 0) + (house.status.error ?? 0)
  const empty = house.rooms.length === 0 && house.elsewhere.length === 0

  return (
    <div className="tree">
      <div className="house-status">
        <span>
          {pending > 0 ? `${pending} recent ${pending === 1 ? 'entry' : 'entries'} not filed yet` : 'Everything is filed'}
        </span>
        <button className="ghost" onClick={tidy} disabled={tidying || pending === 0}>
          {tidying ? 'Tidying…' : 'Tidy up now'}
        </button>
      </div>
      {summary && <p className="hint">{summary}</p>}
      {redoMessage && <p className="notice">{redoMessage}</p>}
      <SavedCopies
        refreshKey={redoMessage}
        onChanged={(m) => {
          setRedoMessage(m)
          load()
        }}
      />

      {house.questions.length > 0 && (
        <section className="tree-room questions">
          <h3 className="tree-room-name">Questions for you</h3>
          <p className="hint">Answer any of these by just saying it on the main screen.</p>
          <ul className="tree-items">
            {house.questions.map((q) => (
              <li key={q.id} className="tree-item">
                <span className="tree-item-name">
                  {q.question}
                  {q.options.length > 0 && <span className="tree-item-loc"> ({q.options.join(' / ')})</span>}
                  {q.diagram && <pre className="diagram">{q.diagram}</pre>}
                </span>
                <button className="icon" title="Dismiss" onClick={() => api.dismissQuestion(q.id).then(load)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {empty && (
        <p className="empty">
          Nothing filed yet. Go back and tell it where things are — “the passport is in the top drawer of the office desk” — or
          walk through a room describing what’s where.
        </p>
      )}

      {house.rooms.length > 0 && (
        <div className="tree-controls">
          <button className="link-button" onClick={() => remember(new Set(allIds(house.rooms)))}>
            Expand all
          </button>
          <button className="link-button" onClick={() => remember(new Set())}>
            Collapse all
          </button>
        </div>
      )}

      {house.rooms.map((room) => (
        <Place
          key={room.id}
          node={room}
          depth={0}
          open={open}
          toggle={toggle}
          onRedone={(m) => {
            setRedoMessage(m)
            load()
          }}
        />
      ))}

      {house.elsewhere.length > 0 && (
        <section className="tree-room">
          <h3 className="tree-room-name">Elsewhere</h3>
          <ul className="tree-items">
            {house.elsewhere.map((it) => (
              <ItemRow key={it.id} item={it} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
