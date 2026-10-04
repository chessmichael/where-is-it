import { normalize } from './search'
import { slug } from './locations'
import { now, type Row, type Sql } from './sql'
import type { Detail, Item } from './types'

// Layer 2: the things in the home. Each item sits at one location (or has a
// free-text location_note for places outside the house tree), and every
// placement, move and status change is logged to item_history.

/** What the tidy-up agent can set on an item. Omitted/null = leave unchanged. */
export interface ItemChanges {
  name: string
  category?: string | null
  description?: string | null
  quantity?: number | null
  location_id?: string | null
  location_note?: string | null
  status?: string | null
  lent_to?: string | null
  aliases?: string[] | null
  details?: Detail[] | null
  inbox_id?: string | null // the utterance this change came from (for history)
  place_id?: string | null // this item is also that place (a toolbox that holds things)
}

export class Items {
  constructor(private sql: Sql) {}

  get(id: string): Item | null {
    return this.sql.first<Item>('SELECT * FROM items WHERE id = ?', id)
  }

  all(): Item[] {
    return this.sql.all<Item>('SELECT * FROM items ORDER BY id')
  }

  aliases(id: string): string[] {
    return this.sql.all<{ alias: string }>('SELECT alias FROM item_aliases WHERE item_id = ? ORDER BY alias', id).map((row) => row.alias)
  }

  details(id: string): Detail[] {
    return this.sql.all<Detail>('SELECT key, value FROM item_details WHERE item_id = ? ORDER BY key', id)
  }

  history(id: string): Row[] {
    return this.sql.all('SELECT * FROM item_history WHERE item_id = ? ORDER BY id', id)
  }

  /** Create a new item (id null) or update an existing one. Returns the item's id. */
  save(id: string | null, changes: ItemChanges): string {
    if (id === null) return this.create(changes)
    if (!this.get(id)) throw new Error(`no item ${id}; pass item_id null to create`)
    this.update(id, changes)
    return id
  }

  create(changes: ItemChanges): string {
    const id = this.uniqueId(slug(changes.name))
    const status = changes.status || 'present'
    const timestamp = now()
    this.sql.run(
      `INSERT INTO items (id, name, category, description, quantity, location_id, location_note, status, lent_to, place_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      changes.name,
      changes.category ?? null,
      changes.description ?? null,
      changes.quantity ?? null,
      changes.location_id ?? null,
      changes.location_id ? null : changes.location_note ?? null,
      status,
      status === 'lent' ? changes.lent_to ?? null : null,
      changes.place_id ?? null,
      timestamp,
      timestamp,
    )
    this.logHistory(id, status === 'present' ? 'placed' : status, null, changes.location_id ?? null, changes.inbox_id)
    this.addAliasesAndDetails(id, changes)
    return id
  }

  update(id: string, changes: ItemChanges): void {
    const before = this.get(id)!

    // Work out the item's new state field by field; null/omitted keeps the old value.
    const status = changes.status ?? before.status
    let locationId = before.location_id
    let locationNote = before.location_note
    if (changes.location_id) {
      locationId = changes.location_id // moved to a place in the house
      locationNote = null
    } else if (changes.location_note) {
      locationId = null // now somewhere outside the house tree ("in Sam's car")
      locationNote = changes.location_note
    }
    const after = {
      name: changes.name || before.name,
      category: changes.category ?? before.category,
      description: changes.description ?? before.description,
      quantity: changes.quantity ?? before.quantity,
      location_id: locationId,
      location_note: locationNote,
      status,
      lent_to: status === 'lent' ? changes.lent_to ?? before.lent_to : null,
    }

    this.sql.run(
      `UPDATE items
       SET name = ?, category = ?, description = ?, quantity = ?,
           location_id = ?, location_note = ?, status = ?, lent_to = ?, updated_at = ?
       WHERE id = ?`,
      after.name, after.category, after.description, after.quantity,
      after.location_id, after.location_note, after.status, after.lent_to, now(),
      id,
    )

    if (changes.place_id) this.sql.run('UPDATE items SET place_id = ? WHERE id = ?', changes.place_id, id)

    // An item that is also a place (a toolbox) carries that place along when it moves.
    const placeId = changes.place_id ?? before.place_id
    if (placeId && after.location_id && after.location_id !== before.location_id) {
      this.sql.run('UPDATE locations SET parent_id = ?, updated_at = ? WHERE id = ?', after.location_id, now(), placeId)
    }

    const event = historyEvent(before, after)
    if (event) this.logHistory(id, event, before.location_id, after.location_id, changes.inbox_id)
    this.addAliasesAndDetails(id, changes)
  }

  relate(subjectId: string, relation: string, objectId: string, note: string | null): void {
    if (!this.get(subjectId) || !this.get(objectId)) throw new Error('both items must exist')
    this.sql.run(
      `INSERT INTO relationships (subject_item_id, relation, object_item_id, note) VALUES (?, ?, ?, ?)
       ON CONFLICT DO UPDATE SET note = excluded.note`,
      subjectId, relation, objectId, note,
    )
  }

  relationships(): { subject_item_id: string; relation: string; object_item_id: string; note: string | null }[] {
    return this.sql.all('SELECT * FROM relationships ORDER BY subject_item_id, relation, object_item_id')
  }

  /**
   * Two rows are the same thing: fold `removeId` into `keepId` — its aliases,
   * details, relationships and history move over — then delete `removeId`.
   */
  merge(keepId: string, removeId: string): void {
    const removed = this.get(removeId)
    if (!this.get(keepId) || !removed) throw new Error('both items must exist')
    if (keepId === removeId) return

    // Keep the old name findable, and carry over everything known about it.
    this.sql.run('INSERT OR IGNORE INTO item_aliases (item_id, alias) SELECT ?, alias FROM item_aliases WHERE item_id = ?', keepId, removeId)
    this.sql.run('INSERT OR IGNORE INTO item_aliases (item_id, alias) VALUES (?, ?)', keepId, removed.name)
    this.sql.run('INSERT OR IGNORE INTO item_details (item_id, key, value) SELECT ?, key, value FROM item_details WHERE item_id = ?', keepId, removeId)
    this.sql.run('UPDATE OR IGNORE relationships SET subject_item_id = ? WHERE subject_item_id = ?', keepId, removeId)
    this.sql.run('UPDATE OR IGNORE relationships SET object_item_id = ? WHERE object_item_id = ?', keepId, removeId)
    this.sql.run('UPDATE item_history SET item_id = ? WHERE item_id = ?', keepId, removeId)

    // Remove what's left of the duplicate.
    this.sql.run('DELETE FROM item_aliases WHERE item_id = ?', removeId)
    this.sql.run('DELETE FROM item_details WHERE item_id = ?', removeId)
    this.sql.run('DELETE FROM relationships WHERE subject_item_id = ? OR object_item_id = ?', removeId, removeId)
    this.sql.run('DELETE FROM items WHERE id = ?', removeId)
  }

  // ── helpers ──

  private logHistory(id: string, event: string, from: string | null, to: string | null, inboxId?: string | null): void {
    this.sql.run(
      `INSERT INTO item_history (item_id, event, from_location_id, to_location_id, at, inbox_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id, event, from, to, now(), inboxId ?? null,
    )
  }

  private addAliasesAndDetails(id: string, changes: ItemChanges): void {
    for (const alias of changes.aliases ?? []) {
      if (normalize(alias) === normalize(changes.name)) continue // not an alias, it's the name
      this.sql.run('INSERT OR IGNORE INTO item_aliases (item_id, alias) VALUES (?, ?)', id, alias)
    }
    for (const detail of changes.details ?? []) {
      this.sql.run(
        `INSERT INTO item_details (item_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT(item_id, key) DO UPDATE SET value = excluded.value`,
        id, detail.key, detail.value,
      )
    }
  }

  private uniqueId(base: string): string {
    let id = base
    for (let n = 2; this.get(id); n++) id = `${base}-${n}`
    return id
  }
}

/**
 * What to write in item_history when an item changes, or null if nothing
 * history-worthy happened:
 *   status became lent / gone / lost       → that status
 *   came back from being lent              → "returned"
 *   turned up after being lost or gone     → "found"
 *   just changed place                     → "moved"
 */
export function historyEvent(
  before: Pick<Item, 'status' | 'location_id' | 'location_note'>,
  after: Pick<Item, 'status' | 'location_id' | 'location_note'>,
): string | null {
  if (after.status !== before.status) {
    if (after.status !== 'present') return after.status
    return before.status === 'lent' ? 'returned' : 'found'
  }
  const moved = after.location_id !== before.location_id || after.location_note !== before.location_note
  return moved ? 'moved' : null
}
