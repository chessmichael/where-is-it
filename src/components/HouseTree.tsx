import { useCallback, useEffect, useState } from 'react'
import { api, type House, type HouseItem, type HouseNode } from '../lib/api'

// Read-only view of the compacted house (layer 2), plus what's still waiting
// in the inbox and any open questions from the agent.

function ItemRow({ item }: { item: HouseItem & { location_note?: string } }) {
  const extra = [
    item.quantity && item.quantity > 1 ? `×${item.quantity}` : '',
    item.status !== 'present' ? `${item.status}${item.lent_to ? ` to ${item.lent_to}` : ''}` : '',
    ...(item.details ?? []).map((d) => d.value),
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

function NodeBlock({ node }: { node: HouseNode }) {
  return (
    <div className="tree-node">
      <div className="tree-node-head">
        <span className="tree-node-name">{node.name}</span>
        <span className="tree-node-type">{node.kind}</span>
        {node.position && <span className="tree-node-type position">{node.position}</span>}
      </div>
      {node.description && <p className="tree-node-desc">{node.description}</p>}
      {(node.items.length > 0 || node.children.length > 0) && (
        <div className="tree-children">
          {node.items.length > 0 && (
            <ul className="tree-items">
              {node.items.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          )}
          {node.children.map((c) => (
            <NodeBlock key={c.id} node={c} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HouseTree() {
  const [house, setHouse] = useState<House | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tidying, setTidying] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

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

      {house.rooms.map((room) => (
        <section key={room.id} className="tree-room">
          <h3 className="tree-room-name">{room.name}</h3>
          {room.items.length > 0 && (
            <ul className="tree-items">
              {room.items.map((it) => (
                <ItemRow key={it.id} item={it} />
              ))}
            </ul>
          )}
          {room.children.map((c) => (
            <NodeBlock key={c.id} node={c} />
          ))}
        </section>
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
