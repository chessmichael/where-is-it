import {
  childrenOf,
  deleteItem,
  deleteNode,
  getItems,
  getRooms,
  itemsInNode,
} from '../lib/model'
import type { Item, LocationNode } from '../lib/types'

interface Props {
  highlightId?: string
  onChange: () => void
}

function ItemRow({ item, highlight, onChange }: { item: Item; highlight: boolean; onChange: () => void }) {
  return (
    <li className={highlight ? 'tree-item hi' : 'tree-item'}>
      <span className="tree-item-name">
        {item.name}
        {item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}
      </span>
      <button
        className="icon"
        title="Delete"
        onClick={() => {
          deleteItem(item.id)
          onChange()
        }}
      >
        ✕
      </button>
    </li>
  )
}

function NodeBlock({
  node,
  highlightId,
  onChange,
}: {
  node: LocationNode
  highlightId?: string
  onChange: () => void
}) {
  const directItems = itemsInNode(node.id, false)
  const children = childrenOf(node.id)
  return (
    <div className="tree-node">
      <div className="tree-node-head">
        <span className="tree-node-name">{node.name}</span>
        <span className="tree-node-type">{node.type}</span>
        <button
          className="icon"
          title="Delete this spot"
          onClick={() => {
            deleteNode(node.id)
            onChange()
          }}
        >
          ✕
        </button>
      </div>
      {(directItems.length > 0 || children.length > 0) && (
        <div className="tree-children">
          {directItems.length > 0 && (
            <ul className="tree-items">
              {directItems.map((it) => (
                <ItemRow key={it.id} item={it} highlight={it.id === highlightId} onChange={onChange} />
              ))}
            </ul>
          )}
          {children.map((c) => (
            <NodeBlock key={c.id} node={c} highlightId={highlightId} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HouseTree({ highlightId, onChange }: Props) {
  const rooms = getRooms()
  const allItems = getItems()
  const unplaced = allItems.filter((i) => !i.locationId)

  if (rooms.length === 0 && allItems.length === 0) {
    return (
      <p className="empty">
        Your house is empty so far. Tap <strong>Set up</strong> to walk through a room and describe
        what’s in it — or just start talking on the main screen.
      </p>
    )
  }

  return (
    <div className="tree">
      {rooms.map((room) => {
        const roomItems = itemsInNode(room.id, false)
        const furniture = childrenOf(room.id)
        return (
          <section key={room.id} className="tree-room">
            <h3 className="tree-room-name">{room.name}</h3>
            {roomItems.length > 0 && (
              <ul className="tree-items">
                {roomItems.map((it) => (
                  <ItemRow key={it.id} item={it} highlight={it.id === highlightId} onChange={onChange} />
                ))}
              </ul>
            )}
            {furniture.map((f) => (
              <NodeBlock key={f.id} node={f} highlightId={highlightId} onChange={onChange} />
            ))}
          </section>
        )
      })}

      {unplaced.length > 0 && (
        <section className="tree-room">
          <h3 className="tree-room-name">Not placed yet</h3>
          <ul className="tree-items">
            {unplaced.map((it) => (
              <li key={it.id} className={it.id === highlightId ? 'tree-item hi' : 'tree-item'}>
                <span className="tree-item-name">
                  {it.name}
                  {it.locationText ? <span className="tree-item-loc"> — {it.locationText}</span> : ''}
                </span>
                <button
                  className="icon"
                  title="Delete"
                  onClick={() => {
                    deleteItem(it.id)
                    onChange()
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
