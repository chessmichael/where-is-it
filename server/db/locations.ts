import { normalize, rank } from './search'
import { now, type Sql } from './sql'
import { checkGrid, drawLayout, gridText, layoutOf, type GridCell, type Layout } from './layout'
import type { Item, Location, PathStep } from './types'

// Layer 2: the places in the home, as a tree.
//   Garage                       id: garage
//   └ Metal shelving             id: garage/metal-shelving
//     └ Top shelf                id: garage/metal-shelving/top-shelf
// Ids are the path of slugs, so they're readable in exports and SQL.

export class Locations {
  constructor(private sql: Sql) {}

  get(id: string): Location | null {
    return this.sql.first<Location>('SELECT * FROM locations WHERE id = ?', id)
  }

  all(): Location[] {
    return this.sql.all<Location>('SELECT * FROM locations ORDER BY id')
  }

  childrenOf(parentId: string | null): Location[] {
    return parentId === null
      ? this.sql.all<Location>('SELECT * FROM locations WHERE parent_id IS NULL ORDER BY name')
      : this.sql.all<Location>('SELECT * FROM locations WHERE parent_id = ? ORDER BY name', parentId)
  }

  aliases(id: string): string[] {
    return this.sql
      .all<{ alias: string }>('SELECT alias FROM location_aliases WHERE location_id = ? ORDER BY alias', id)
      .map((row) => row.alias)
  }

  /** "Garage › Metal shelving › Top shelf" for a location id. */
  path(id: string | null): string | null {
    if (!id) return null
    return this.sql.first<{ path: string }>('SELECT path FROM location_paths WHERE id = ?', id)?.path ?? null
  }

  /**
   * Find (or create) each level of a path, room first, and return the
   * innermost location's id. Existing places are matched by name, slug or
   * alias, so "the garage shelves" can land on "Metal shelving".
   */
  ensurePath(path: PathStep[]): string {
    if (path.length === 0) throw new Error('empty location path')
    let parent: Location | null = null
    for (const [depth, step] of path.entries()) {
      const existing = this.findChild(parent?.id ?? null, step.name)
      parent = existing ? this.refine(existing, step, depth) : this.create(parent, step, depth)
    }
    return parent!.id
  }

  /**
   * The address a person reads, with positions where known:
   * "Basement › Closet › Box of old photos (top of the stack)".
   */
  describedPath(id: string | null): string | null {
    const chain: Location[] = []
    for (let loc = id ? this.get(id) : null; loc; loc = loc.parent_id ? this.get(loc.parent_id) : null) chain.unshift(loc)
    if (!chain.length) return null
    return chain.map((loc) => (loc.position ? `${loc.name} (${loc.position})` : loc.name)).join(' › ')
  }

  /** Rename / re-describe / re-position a location. Null fields are left as they are. */
  update(
    id: string,
    changes: { name?: string | null; kind?: string | null; preposition?: string | null; description?: string | null; position?: string | null; grid?: GridCell | null; aliases?: string[] | null },
    inboxId?: string | null,
  ): void {
    const before = this.get(id)
    if (!before) throw new Error(`no location ${id}`)
    if (changes.position && changes.position !== before.position) {
      this.sql.run('UPDATE locations SET position = ? WHERE id = ?', changes.position, id)
      this.logHistory(id, 'repositioned', before.parent_id, before.parent_id, before.position, changes.position, inboxId)
    }
    if (changes.grid) {
      const grid = JSON.stringify(checkGrid(changes.grid))
      if (grid !== before.grid) {
        this.sql.run('UPDATE locations SET grid = ? WHERE id = ?', grid, id)
        this.logHistory(id, 'repositioned', before.parent_id, before.parent_id, gridText(before.grid), gridText(grid), inboxId)
      }
    }
    this.sql.run(
      `UPDATE locations
       SET name        = COALESCE(?, name),
           kind        = COALESCE(?, kind),
           preposition = COALESCE(?, preposition),
           description = COALESCE(?, description),
           updated_at  = ?
       WHERE id = ?`,
      changes.name ?? null, changes.kind ?? null, changes.preposition ?? null, changes.description ?? null, now(), id,
    )
    for (const alias of changes.aliases ?? []) this.addAlias(id, alias)
  }

  /**
   * Move a place (and so everything in it) under a new parent: the red tote
   * goes to the attic, its contents with it. Items that ARE this place (a
   * toolbox) move with it. Optionally sets its new position.
   */
  move(id: string, newParentId: string, position?: string | null, inboxId?: string | null): void {
    const place = this.get(id)
    if (!place) throw new Error(`no location ${id}`)
    if (!this.get(newParentId)) throw new Error(`no location ${newParentId}`)
    if (this.isWithin(newParentId, id)) throw new Error(`can't move ${place.name} inside itself`)
    if (place.parent_id === newParentId && !position) return
    this.sql.run('UPDATE locations SET parent_id = ?, position = COALESCE(?, position), updated_at = ? WHERE id = ?', newParentId, position ?? null, now(), id)
    this.sql.run('UPDATE items SET location_id = ?, updated_at = ? WHERE place_id = ?', newParentId, now(), id)
    this.logHistory(id, 'moved', place.parent_id, newParentId, place.position, position ?? place.position, inboxId)
  }

  /** Is `id` the place `ancestorId` or somewhere inside it? */
  isWithin(id: string, ancestorId: string): boolean {
    for (let loc = this.get(id); loc; loc = loc.parent_id ? this.get(loc.parent_id) : null) if (loc.id === ancestorId) return true
    return false
  }

  history(id: string) {
    return this.sql.all('SELECT * FROM location_history WHERE location_id = ? ORDER BY id', id)
  }

  /**
   * Two locations are the same place: move everything from `removeId` into
   * `keepId` (child places, items, history, aliases), then delete `removeId`.
   */
  merge(keepId: string, removeId: string): void {
    const removed = this.get(removeId)
    if (!this.get(keepId) || !removed) throw new Error('both locations must exist')
    if (keepId === removeId) return

    this.sql.run('UPDATE locations SET parent_id = ? WHERE parent_id = ?', keepId, removeId)
    this.sql.run('UPDATE items SET location_id = ? WHERE location_id = ?', keepId, removeId)
    this.sql.run('UPDATE item_history SET to_location_id = ? WHERE to_location_id = ?', keepId, removeId)
    this.sql.run('UPDATE item_history SET from_location_id = ? WHERE from_location_id = ?', keepId, removeId)
    this.sql.run('UPDATE items SET place_id = ? WHERE place_id = ?', keepId, removeId)
    this.sql.run('UPDATE location_history SET location_id = ? WHERE location_id = ?', keepId, removeId)

    // Keep the old name findable.
    this.sql.run(
      `INSERT OR IGNORE INTO location_aliases (location_id, alias)
       SELECT ?, alias FROM location_aliases WHERE location_id = ?`,
      keepId, removeId,
    )
    this.addAlias(keepId, removed.name)

    this.sql.run('DELETE FROM location_aliases WHERE location_id = ?', removeId)
    this.sql.run('DELETE FROM locations WHERE id = ?', removeId)
  }

  /** How a place's parts are laid out (from their grid cells), or null if none has a cell. */
  layout(id: string): Layout | null {
    return layoutOf(this.childrenOf(id), (childId) =>
      this.sql
        .all<{ name: string }>(
          `WITH RECURSIVE inside(id) AS (SELECT ? UNION ALL SELECT l.id FROM locations l JOIN inside ON l.parent_id = inside.id)
           SELECT i.name FROM items i JOIN inside ON i.location_id = inside.id
           WHERE i.status != 'gone' AND (i.place_id IS NULL OR i.place_id != ?) ORDER BY i.name`,
          childId, childId,
        )
        .map((row) => row.name),
    )
  }

  /** The fixed-width drawing of a place's layout, or null if it has none. */
  drawing(id: string): string | null {
    const place = this.get(id)
    const layout = place ? this.layout(id) : null
    return place && layout ? drawLayout(place.name, layout) : null
  }

  /** Look a location up by id, by path ("Garage › Shelf"), or by fuzzy name. */
  resolve(reference: string): Location | null {
    const byId = this.get(reference) ?? this.get(slug(reference))
    if (byId) return byId

    const parts = reference.split(/›|>|\//).map((part) => part.trim()).filter(Boolean)
    if (parts.length > 1) {
      let node: Location | null = null
      for (const part of parts) {
        node = this.findChild(node?.id ?? null, part)
        if (!node) break
      }
      if (node) return node
    }

    return this.search(reference)[0]?.location ?? null
  }

  /** Locations ranked by how well their name or aliases match the query. */
  search(query: string): { location: Location; score: number }[] {
    const candidates = this.all().map((location) => ({ ...location, aliases: this.aliases(location.id) }))
    return rank(query, candidates).map((match) => ({ location: match.item, score: match.score }))
  }

  /** A place and everything under it, for "what's in the hall closet?". */
  contents(id: string) {
    const root = this.get(id)
    if (!root) return null
    const describe = (location: Location): unknown => ({
      id: location.id,
      name: location.name,
      kind: location.kind,
      preposition: location.preposition,
      position: location.position,
      ...(location.grid ? { grid: gridText(location.grid) } : {}),
      description: location.description,
      items: this.sql
        .all<Item>(`SELECT * FROM items WHERE location_id = ? AND status != 'gone' ORDER BY name`, location.id)
        .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, status: item.status })),
      children: this.childrenOf(location.id).map(describe),
    })
    return { path: this.describedPath(id), ...(describe(root) as object) }
  }

  // ── helpers ──

  private logHistory(id: string, event: string, fromParent: string | null, toParent: string | null, fromPosition: string | null, toPosition: string | null, inboxId?: string | null) {
    this.sql.run(
      `INSERT INTO location_history (location_id, event, from_parent_id, to_parent_id, from_position, to_position, at, inbox_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, event, fromParent, toParent, fromPosition, toPosition, now(), inboxId ?? null,
    )
  }

  private addAlias(id: string, alias: string): void {
    this.sql.run('INSERT OR IGNORE INTO location_aliases (location_id, alias) VALUES (?, ?)', id, alias)
  }

  /** The child of `parentId` (or the room, when null) that `name` refers to. */
  private findChild(parentId: string | null, name: string): Location | null {
    const children = this.childrenOf(parentId)
    const wanted = normalize(name)
    const byName = children.find((child) => normalize(child.name) === wanted || lastSegment(child.id) === slug(name))
    if (byName) return byName
    return children.find((child) => this.aliases(child.id).some((alias) => normalize(alias) === wanted)) ?? null
  }

  /** An existing level was matched; take any kind/preposition the agent supplied. */
  private refine(existing: Location, step: PathStep, depth: number): Location {
    const kind = depth > 0 && step.kind ? step.kind : null // a room stays a room
    const preposition = step.preposition ?? null
    if (kind || preposition) {
      this.sql.run(
        `UPDATE locations
         SET kind = COALESCE(?, kind), preposition = COALESCE(?, preposition), updated_at = ?
         WHERE id = ?`,
        kind, preposition, now(), existing.id,
      )
    }
    return this.get(existing.id)!
  }

  private create(parent: Location | null, step: PathStep, depth: number): Location {
    const kind = depth === 0 ? 'room' : step.kind || 'storage'
    const id = this.uniqueId(parent ? `${parent.id}/${slug(step.name)}` : slug(step.name))
    const timestamp = now()
    this.sql.run(
      `INSERT INTO locations (id, name, kind, parent_id, preposition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, sentenceCase(step.name), kind, parent?.id ?? null, step.preposition || defaultPreposition(kind), timestamp, timestamp,
    )
    return this.get(id)!
  }

  private uniqueId(base: string): string {
    let id = base
    for (let n = 2; this.get(id); n++) id = `${base}-${n}`
    return id
  }
}

/** "Top Shelf!" → "top-shelf" */
export function slug(text: string): string {
  return normalize(text).replace(/\s+/g, '-') || 'unnamed'
}

function lastSegment(id: string): string {
  return id.split('/').pop() ?? id
}

function sentenceCase(text: string): string {
  const trimmed = text.trim()
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Things sit *on* shelves, furniture and fixtures, and *in* everything else. */
function defaultPreposition(kind: string): string {
  return kind === 'shelf' || kind === 'furniture' || kind === 'fixture' ? 'on' : 'in'
}
