import type { HouseDb, InboxEntry } from '../db/house'
import type { Snapshot } from '../db/snapshots'

// "Redo from what I said": re-file a place (and everything in it), or the
// whole house, from the person's original words with the current agent. The
// words are all still in the inbox; this puts the right entries back in line
// for tidy-up, after saving a copy of the house so the redo can be undone.
//
//   whole house — the house tables are cleared and rebuilt from every entry.
//   one place   — the entries that ever filed something into that place or
//                 anything inside it are re-read, and tidy-up fixes the place
//                 in place (names, layout, which part things are on), reusing
//                 what's there rather than starting over.

export const REDO_NOTE = 'redo'

export interface RedoPlan {
  snapshot: Snapshot
  scope: { location_id: string; path: string } | 'house'
  entries: number
}

/** The inbox entries behind a place: every utterance that filed or moved something into it or anything inside it. */
export function entriesForPlace(db: HouseDb, locationId: string): InboxEntry[] {
  const rows = db.sql.all<{ inbox_id: string }>(
    `WITH RECURSIVE inside(id) AS (SELECT ? UNION ALL SELECT l.id FROM locations l JOIN inside ON l.parent_id = inside.id)
     SELECT h.inbox_id FROM location_history h JOIN inside ON h.location_id = inside.id OR h.to_parent_id = inside.id WHERE h.inbox_id IS NOT NULL
     UNION
     SELECT h.inbox_id FROM item_history h JOIN inside ON h.to_location_id = inside.id WHERE h.inbox_id IS NOT NULL
     UNION
     SELECT h.inbox_id FROM item_history h JOIN items i ON i.id = h.item_id JOIN inside ON i.location_id = inside.id WHERE h.inbox_id IS NOT NULL`,
    locationId,
  )
  return rows.map((r) => db.inbox.get(r.inbox_id)).filter((e): e is InboxEntry => !!e)
}

/** Save a copy, then queue the entries for tidy-up with a redo note. Run tidy-up afterwards. */
export function planRedo(db: HouseDb, locationId: string | null): RedoPlan {
  if (locationId) {
    const place = db.locations.get(locationId)
    if (!place) throw new Error(`no place ${locationId}`)
    const path = db.locations.path(locationId) ?? place.name
    const entries = entriesForPlace(db, locationId)
    if (!entries.length) throw new Error(`nothing you said is linked to ${place.name} yet`)
    const snapshot = db.snapshots.take(`Before redoing ${path}`)
    db.sql.tx(() => {
      for (const e of entries) db.inbox.update(e.id, { status: 'pending_compaction', note: `${REDO_NOTE}: ${path}` })
    })
    return { snapshot, scope: { location_id: locationId, path }, entries: entries.length }
  }

  const entries = db.inbox.list().filter((e) => ['compacted', 'pending_compaction', 'error', 'needs_clarification'].includes(e.status))
  if (!entries.length) throw new Error('nothing to redo yet')
  const snapshot = db.snapshots.take('Before redoing the whole house')
  db.resetHouse() // its own transaction; the copy above can bring everything back
  db.sql.tx(() => {
    for (const e of entries) db.inbox.update(e.id, { status: 'pending_compaction', note: `${REDO_NOTE}: whole house` })
  })
  return { snapshot, scope: 'house', entries: entries.length }
}

/** Tidy-up's extra instructions when some of its entries are being redone. */
export function redoInstructions(entries: InboxEntry[]): string | null {
  const scopes = [...new Set(entries.filter((e) => e.note?.startsWith(`${REDO_NOTE}:`)).map((e) => e.note!.slice(REDO_NOTE.length + 1).trim()))]
  if (!scopes.length) return null
  return `<redo scope="${scopes.join('; ')}">
The person asked you to redo ${scopes.map((s) => (s === 'whole house' ? 'the whole house' : `“${s}”`)).join(' and ')} from what they originally said. These entries were filed before, by an older version of you; the house map shows that result (or nothing, for the whole house). Re-read the original words ("said") — older observations may carry the old mistakes — and make the house match them:
- Fix the existing places in place: rename places named by their neighbors to plain names, set layout cells (grid) for the parts of furniture, set positions, move items to the part they're really on (upsert_item with item_id), merge duplicates, and correct obvious mishearings using answered questions.
- Reuse what exists — never create a second copy of a place or item that's already in the map.
- If the original words leave the arrangement ambiguous, ask (ask_user, with a sketch of your best understanding) and leave those entries pending.
</redo>`
}
