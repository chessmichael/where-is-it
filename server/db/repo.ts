import { HOUSE_TABLES, SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema'
import { normalize, rank } from './search'
import { TRACE_INDEX, TRACE_SCHEMA } from '../trace'
import type { Observation } from '../agent/observations'

// Typed access to one account's SQLite database. All writes go through here so
// the agent tools never touch SQL directly.

export type Row = Record<string, SqlStorageValue>

export interface InboxEntry {
  id: string
  at: string
  conversation: string
  said: string
  observations: Observation[]
  agent_reply: string | null
  status: string
  compacted_at: string | null
  note: string | null
}

export interface Question {
  id: string
  at: string
  conversation: string | null
  inbox_ids: string[]
  question: string
  options: string[]
  status: string
  answer: string | null
  answered_by: string | null
}

export interface LocationRow {
  id: string
  name: string
  kind: string
  parent_id: string | null
  preposition: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface ItemRow {
  id: string
  name: string
  category: string | null
  description: string | null
  quantity: number | null
  location_id: string | null
  location_note: string | null
  status: string
  lent_to: string | null
  created_at: string
  updated_at: string
}

export interface PathStep {
  name: string
  kind?: string | null
  preposition?: string | null
}

export const LOCATION_KINDS = ['room', 'furniture', 'storage', 'shelf', 'container', 'area', 'fixture'] as const
export const ITEM_STATUSES = ['present', 'lent', 'gone', 'lost'] as const

export function slug(s: string): string {
  return normalize(s).replace(/\s+/g, '-') || 'unnamed'
}

const now = () => new Date().toISOString()

export class HouseDb {
  constructor(
    private sql: SqlStorage,
    private transaction: <T>(fn: () => T) => T,
  ) {}

  // ── plumbing ────────────────────────────────────────────────────────────

  migrate(): void {
    for (const s of SCHEMA_STATEMENTS) this.sql.exec(s)
    // Traces live here too but stay out of house.sql (they're exported as files).
    this.sql.exec(TRACE_SCHEMA)
    this.sql.exec(TRACE_INDEX)
    this.setMeta('schema_version', String(SCHEMA_VERSION))
  }

  tx<T>(fn: () => T): T {
    return this.transaction(fn)
  }

  all<T = Row>(query: string, ...args: SqlStorageValue[]): T[] {
    return this.sql.exec(query, ...args).toArray() as T[]
  }

  first<T = Row>(query: string, ...args: SqlStorageValue[]): T | null {
    return (this.all<T>(query, ...args)[0] ?? null) as T | null
  }

  run(query: string, ...args: SqlStorageValue[]): void {
    this.sql.exec(query, ...args)
  }

  getMeta(key: string): string | null {
    return this.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value)
  }

  private counter(key: string): number {
    const n = Number(this.getMeta(key) ?? '0') + 1
    this.setMeta(key, String(n))
    return n
  }

  // ── layer 1: inbox ─────────────────────────────────────────────────────

  addInbox(conversation: string, said: string): InboxEntry {
    const at = now()
    const day = at.slice(0, 10)
    const id = `in_${day}_${String(this.counter(`seq:inbox:${day}`)).padStart(4, '0')}`
    this.run(
      `INSERT INTO inbox (id, at, conversation, said, status) VALUES (?, ?, ?, ?, 'received')`,
      id, at, conversation, said,
    )
    return this.getInbox(id)!
  }

  getInbox(id: string): InboxEntry | null {
    const r = this.first('SELECT * FROM inbox WHERE id = ?', id)
    return r ? inboxFromRow(r) : null
  }

  updateInbox(id: string, patch: Partial<Pick<InboxEntry, 'observations' | 'agent_reply' | 'status' | 'note' | 'compacted_at'>>): void {
    const cur = this.getInbox(id)
    if (!cur) throw new Error(`no inbox entry ${id}`)
    const next = { ...cur, ...patch }
    this.run(
      'UPDATE inbox SET observations = ?, agent_reply = ?, status = ?, note = ?, compacted_at = ? WHERE id = ?',
      JSON.stringify(next.observations), next.agent_reply, next.status, next.note, next.compacted_at, id,
    )
  }

  listInbox(opts: { status?: string; limit?: number } = {}): InboxEntry[] {
    const rows = opts.status
      ? this.all('SELECT * FROM inbox WHERE status = ? ORDER BY at, id LIMIT ?', opts.status, opts.limit ?? 10000)
      : this.all('SELECT * FROM inbox ORDER BY at, id LIMIT ?', opts.limit ?? 100000)
    return rows.map(inboxFromRow)
  }

  // Last few exchanges of a conversation, oldest first, excluding `beforeId`.
  conversationHistory(conversation: string, beforeId: string, limit = 8): InboxEntry[] {
    return this.all('SELECT * FROM inbox WHERE conversation = ? AND id != ? ORDER BY at DESC, id DESC LIMIT ?', conversation, beforeId, limit)
      .map(inboxFromRow)
      .reverse()
  }

  countByStatus(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const r of this.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM inbox GROUP BY status')) out[r.status] = r.n
    return out
  }

  // ── questions ───────────────────────────────────────────────────────────

  addQuestion(q: { conversation: string | null; inbox_ids: string[]; question: string; options: string[] }): Question {
    const id = `q_${String(this.counter('seq:question')).padStart(4, '0')}`
    this.run(
      `INSERT INTO questions (id, at, conversation, inbox_ids, question, options, status) VALUES (?, ?, ?, ?, ?, ?, 'open')`,
      id, now(), q.conversation, JSON.stringify(q.inbox_ids), q.question, JSON.stringify(q.options),
    )
    return this.getQuestion(id)!
  }

  getQuestion(id: string): Question | null {
    const r = this.first('SELECT * FROM questions WHERE id = ?', id)
    return r ? questionFromRow(r) : null
  }

  openQuestions(): Question[] {
    return this.all(`SELECT * FROM questions WHERE status = 'open' ORDER BY at`).map(questionFromRow)
  }

  resolveQuestion(id: string, status: 'answered' | 'dismissed', answer: string | null, answeredBy: string | null): void {
    const q = this.getQuestion(id)
    this.run('UPDATE questions SET status = ?, answer = ?, answered_by = ? WHERE id = ?', status, answer, answeredBy, id)
    // Entries held back by this question become fileable again; compaction
    // sees the answer alongside them.
    for (const inboxId of q?.inbox_ids ?? []) {
      this.run(
        `UPDATE inbox SET status = 'pending_compaction', note = ? WHERE id = ? AND status = 'needs_clarification'`,
        `${id} ${status}: ${answer ?? ''}`, inboxId,
      )
    }
  }

  // ── layer 2: locations ──────────────────────────────────────────────────

  getLocation(id: string): LocationRow | null {
    return this.first<LocationRow>('SELECT * FROM locations WHERE id = ?', id)
  }

  locations(): LocationRow[] {
    return this.all<LocationRow>('SELECT * FROM locations ORDER BY id')
  }

  locationAliases(id: string): string[] {
    return this.all<{ alias: string }>('SELECT alias FROM location_aliases WHERE location_id = ? ORDER BY alias', id).map((r) => r.alias)
  }

  locationPath(id: string | null): string | null {
    if (!id) return null
    return this.first<{ path: string }>('SELECT path FROM location_paths WHERE id = ?', id)?.path ?? null
  }

  // A child of `parentId` (or a room when null) whose name/alias/slug matches.
  private findChild(parentId: string | null, name: string): LocationRow | null {
    const kids = parentId
      ? this.all<LocationRow>('SELECT * FROM locations WHERE parent_id = ?', parentId)
      : this.all<LocationRow>('SELECT * FROM locations WHERE parent_id IS NULL')
    const want = normalize(name)
    return (
      kids.find((k) => normalize(k.name) === want || k.id.split('/').pop() === slug(name)) ??
      kids.find((k) => this.locationAliases(k.id).some((a) => normalize(a) === want)) ??
      null
    )
  }

  // Walks/creates the chain room → … → leaf and returns the leaf id.
  ensurePath(path: PathStep[]): string {
    if (path.length === 0) throw new Error('empty location path')
    let parent: LocationRow | null = null
    path.forEach((step, depth) => {
      const found = this.findChild(parent?.id ?? null, step.name)
      if (found) {
        const kind = step.kind && depth > 0 ? step.kind : null
        if (kind || step.preposition) {
          this.run(
            'UPDATE locations SET kind = COALESCE(?, kind), preposition = COALESCE(?, preposition), updated_at = ? WHERE id = ?',
            kind, step.preposition ?? null, now(), found.id,
          )
        }
        parent = this.getLocation(found.id)
        return
      }
      const base = parent ? `${parent.id}/${slug(step.name)}` : slug(step.name)
      const id = this.uniqueId('locations', base)
      const kind = depth === 0 ? 'room' : step.kind || 'storage'
      const t = now()
      this.run(
        'INSERT INTO locations (id, name, kind, parent_id, preposition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, cap(step.name), kind, parent?.id ?? null, step.preposition || defaultPreposition(kind), t, t,
      )
      parent = this.getLocation(id)
    })
    return (parent as LocationRow | null)!.id
  }

  updateLocation(id: string, patch: { name?: string | null; kind?: string | null; preposition?: string | null; description?: string | null; aliases?: string[] | null }): void {
    if (!this.getLocation(id)) throw new Error(`no location ${id}`)
    this.run(
      `UPDATE locations SET name = COALESCE(?, name), kind = COALESCE(?, kind), preposition = COALESCE(?, preposition),
         description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
      patch.name ?? null, patch.kind ?? null, patch.preposition ?? null, patch.description ?? null, now(), id,
    )
    for (const a of patch.aliases ?? []) this.run('INSERT OR IGNORE INTO location_aliases (location_id, alias) VALUES (?, ?)', id, a)
  }

  // Folds `removeId` into `keepId`: children, items, history and aliases move.
  mergeLocations(keepId: string, removeId: string): void {
    const keep = this.getLocation(keepId)
    const gone = this.getLocation(removeId)
    if (!keep || !gone) throw new Error('both locations must exist')
    if (keepId === removeId) return
    this.run('UPDATE locations SET parent_id = ? WHERE parent_id = ?', keepId, removeId)
    this.run('UPDATE items SET location_id = ? WHERE location_id = ?', keepId, removeId)
    this.run('UPDATE item_history SET to_location_id = ? WHERE to_location_id = ?', keepId, removeId)
    this.run('UPDATE item_history SET from_location_id = ? WHERE from_location_id = ?', keepId, removeId)
    this.run('INSERT OR IGNORE INTO location_aliases (location_id, alias) SELECT ?, alias FROM location_aliases WHERE location_id = ?', keepId, removeId)
    this.run('INSERT OR IGNORE INTO location_aliases (location_id, alias) VALUES (?, ?)', keepId, gone.name)
    this.run('DELETE FROM location_aliases WHERE location_id = ?', removeId)
    this.run('DELETE FROM locations WHERE id = ?', removeId)
  }

  // ── layer 2: items ──────────────────────────────────────────────────────

  getItem(id: string): ItemRow | null {
    return this.first<ItemRow>('SELECT * FROM items WHERE id = ?', id)
  }

  items(): ItemRow[] {
    return this.all<ItemRow>('SELECT * FROM items ORDER BY id')
  }

  itemAliases(id: string): string[] {
    return this.all<{ alias: string }>('SELECT alias FROM item_aliases WHERE item_id = ? ORDER BY alias', id).map((r) => r.alias)
  }

  itemDetails(id: string): { key: string; value: string }[] {
    return this.all<{ key: string; value: string }>('SELECT key, value FROM item_details WHERE item_id = ? ORDER BY key', id)
  }

  upsertItem(u: {
    item_id: string | null
    name: string
    category?: string | null
    description?: string | null
    quantity?: number | null
    location_id?: string | null
    location_note?: string | null
    status?: string | null
    lent_to?: string | null
    aliases?: string[] | null
    details?: { key: string; value: string }[] | null
    inbox_id?: string | null
  }): string {
    const t = now()
    const existing = u.item_id ? this.getItem(u.item_id) : null
    if (u.item_id && !existing) throw new Error(`no item ${u.item_id}; pass item_id null to create`)
    let id: string
    if (existing) {
      id = existing.id
      const moved = u.location_id !== undefined && u.location_id !== null && u.location_id !== existing.location_id
      const statusChanged = u.status && u.status !== existing.status
      this.run(
        `UPDATE items SET name = ?, category = COALESCE(?, category), description = COALESCE(?, description),
           quantity = COALESCE(?, quantity), location_id = COALESCE(?, location_id),
           location_note = CASE WHEN ? IS NOT NULL THEN NULL ELSE COALESCE(?, location_note) END,
           status = COALESCE(?, status), lent_to = CASE WHEN COALESCE(?, status) = 'lent' THEN COALESCE(?, lent_to) ELSE NULL END,
           updated_at = ? WHERE id = ?`,
        u.name || existing.name, u.category ?? null, u.description ?? null, u.quantity ?? null, u.location_id ?? null,
        u.location_id ?? null, u.location_note ?? null, u.status ?? null, u.status ?? null, u.lent_to ?? null, t, id,
      )
      if (moved || statusChanged) {
        const event = statusChanged && u.status !== 'present' ? u.status! : existing.status !== 'present' && u.status === 'present' ? (existing.status === 'lent' ? 'returned' : 'found') : 'moved'
        this.run(
          'INSERT INTO item_history (item_id, event, from_location_id, to_location_id, at, inbox_id) VALUES (?, ?, ?, ?, ?, ?)',
          id, event, existing.location_id, u.location_id ?? existing.location_id, t, u.inbox_id ?? null,
        )
      }
    } else {
      id = this.uniqueId('items', slug(u.name))
      this.run(
        `INSERT INTO items (id, name, category, description, quantity, location_id, location_note, status, lent_to, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, u.name, u.category ?? null, u.description ?? null, u.quantity ?? null, u.location_id ?? null,
        u.location_id ? null : u.location_note ?? null, u.status || 'present', u.status === 'lent' ? u.lent_to ?? null : null, t, t,
      )
      this.run(
        'INSERT INTO item_history (item_id, event, from_location_id, to_location_id, at, inbox_id) VALUES (?, ?, NULL, ?, ?, ?)',
        id, u.status && u.status !== 'present' ? u.status : 'placed', u.location_id ?? null, t, u.inbox_id ?? null,
      )
    }
    for (const a of u.aliases ?? []) {
      if (normalize(a) !== normalize(u.name)) this.run('INSERT OR IGNORE INTO item_aliases (item_id, alias) VALUES (?, ?)', id, a)
    }
    for (const d of u.details ?? []) {
      this.run('INSERT INTO item_details (item_id, key, value) VALUES (?, ?, ?) ON CONFLICT(item_id, key) DO UPDATE SET value = excluded.value', id, d.key, d.value)
    }
    return id
  }

  relate(subject: string, relation: string, object: string, note: string | null): void {
    if (!this.getItem(subject) || !this.getItem(object)) throw new Error('both items must exist')
    this.run(
      'INSERT INTO relationships (subject_item_id, relation, object_item_id, note) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET note = excluded.note',
      subject, relation, object, note,
    )
  }

  relationships(): { subject_item_id: string; relation: string; object_item_id: string; note: string | null }[] {
    return this.all('SELECT * FROM relationships ORDER BY subject_item_id, relation, object_item_id')
  }

  mergeItems(keepId: string, removeId: string): void {
    const gone = this.getItem(removeId)
    if (!this.getItem(keepId) || !gone) throw new Error('both items must exist')
    if (keepId === removeId) return
    this.run('INSERT OR IGNORE INTO item_aliases (item_id, alias) SELECT ?, alias FROM item_aliases WHERE item_id = ?', keepId, removeId)
    this.run('INSERT OR IGNORE INTO item_aliases (item_id, alias) VALUES (?, ?)', keepId, gone.name)
    this.run('INSERT OR IGNORE INTO item_details (item_id, key, value) SELECT ?, key, value FROM item_details WHERE item_id = ?', keepId, removeId)
    this.run('UPDATE OR IGNORE relationships SET subject_item_id = ? WHERE subject_item_id = ?', keepId, removeId)
    this.run('UPDATE OR IGNORE relationships SET object_item_id = ? WHERE object_item_id = ?', keepId, removeId)
    this.run('UPDATE item_history SET item_id = ? WHERE item_id = ?', keepId, removeId)
    for (const t of ['item_aliases', 'item_details']) this.run(`DELETE FROM ${t} WHERE item_id = ?`, removeId)
    this.run('DELETE FROM relationships WHERE subject_item_id = ? OR object_item_id = ?', removeId, removeId)
    this.run('DELETE FROM items WHERE id = ?', removeId)
  }

  history(itemId: string): Row[] {
    return this.all('SELECT * FROM item_history WHERE item_id = ? ORDER BY id', itemId)
  }

  // ── reads for the agent and UI ──────────────────────────────────────────

  describeItem(it: ItemRow) {
    return {
      id: it.id,
      name: it.name,
      status: it.status,
      lent_to: it.lent_to,
      quantity: it.quantity,
      category: it.category,
      where: this.locationPath(it.location_id) ?? it.location_note,
      preposition: it.location_id ? this.getLocation(it.location_id)?.preposition ?? null : null,
      aliases: this.itemAliases(it.id),
      details: this.itemDetails(it.id),
      updated_at: it.updated_at,
    }
  }

  // Fuzzy search over compacted items and not-yet-compacted observations.
  search(query: string, limit = 8) {
    const items = this.items().map((it) => ({ ...it, aliases: [...this.itemAliases(it.id), ...this.itemDetails(it.id).map((d) => `${d.value} ${it.name}`)] }))
    const compacted = rank(query, items).slice(0, limit).map((m) => ({ ...this.describeItem(m.item), score: round(m.score) }))

    const pending: { name: string; id: string; aliases: string[]; obs: Observation; entry: InboxEntry }[] = []
    for (const e of [...this.listInbox({ status: 'pending_compaction' }), ...this.listInbox({ status: 'needs_clarification' })]) {
      e.observations.forEach((o, i) => {
        if (o.item) pending.push({ id: `${e.id}#${i}`, name: o.item, aliases: o.related_item ? [o.related_item] : [], obs: o, entry: e })
      })
    }
    const recent = rank(query, pending)
      .slice(0, limit)
      .map((m) => ({ inbox_id: m.item.entry.id, at: m.item.entry.at, said: m.item.entry.said, observation: m.item.obs, score: round(m.score) }))

    const locs = rank(query, this.locations().map((l) => ({ ...l, aliases: this.locationAliases(l.id) })))
      .slice(0, 4)
      .map((m) => ({ id: m.item.id, path: this.locationPath(m.item.id), score: round(m.score) }))

    return { items: compacted, recent_unfiled: recent, locations: locs }
  }

  // Resolve a location by id, path ("Garage › Shelf") or fuzzy name.
  resolveLocation(ref: string): LocationRow | null {
    const byId = this.getLocation(ref) ?? this.getLocation(slug(ref))
    if (byId) return byId
    const parts = ref.split(/›|>|\//).map((p) => p.trim()).filter(Boolean)
    if (parts.length > 1) {
      let parent: LocationRow | null = null
      for (const p of parts) {
        parent = this.findChild(parent?.id ?? null, p)
        if (!parent) break
      }
      if (parent) return parent
    }
    const ranked = rank(ref, this.locations().map((l) => ({ ...l, aliases: this.locationAliases(l.id) })))
    return ranked[0]?.item ?? null
  }

  // A subtree with its items, for "what's in the hall closet?".
  locationContents(id: string) {
    const loc = this.getLocation(id)
    if (!loc) return null
    const walk = (l: LocationRow): unknown => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      preposition: l.preposition,
      description: l.description,
      items: this.all<ItemRow>(`SELECT * FROM items WHERE location_id = ? AND status != 'gone' ORDER BY name`, l.id).map((i) => ({
        id: i.id, name: i.name, quantity: i.quantity, status: i.status,
      })),
      children: this.all<LocationRow>('SELECT * FROM locations WHERE parent_id = ? ORDER BY name', l.id).map(walk),
    })
    return { path: this.locationPath(id), ...(walk(loc) as object) }
  }

  // Compact text outline of the whole house with ids — the agents' map.
  outline(withItems: boolean): string {
    const locs = this.locations()
    const items = withItems ? this.items() : []
    const lines: string[] = []
    const walk = (parent: string | null, depth: number) => {
      for (const l of locs.filter((x) => x.parent_id === parent).sort((a, b) => a.name.localeCompare(b.name))) {
        const aliases = this.locationAliases(l.id)
        lines.push(`${'  '.repeat(depth)}- ${l.name} [${l.kind}, ${l.preposition}] id=${l.id}${aliases.length ? ` aka ${aliases.join(', ')}` : ''}`)
        for (const it of items.filter((i) => i.location_id === l.id)) {
          lines.push(`${'  '.repeat(depth + 1)}• ${it.name}${it.quantity ? ` ×${it.quantity}` : ''}${it.status !== 'present' ? ` (${it.status}${it.lent_to ? ` to ${it.lent_to}` : ''})` : ''} item=${it.id}`)
        }
        walk(l.id, depth + 1)
      }
    }
    walk(null, 0)
    for (const it of items.filter((i) => !i.location_id)) {
      lines.push(`• ${it.name} — ${it.location_note ?? 'location unknown'} (${it.status}) item=${it.id}`)
    }
    return lines.length ? lines.join('\n') : '(nothing recorded yet)'
  }

  resetHouse(): void {
    this.tx(() => {
      for (const t of [...HOUSE_TABLES].reverse()) this.run(`DELETE FROM ${t}`)
    })
  }

  private uniqueId(table: 'locations' | 'items', base: string): string {
    let id = base
    for (let n = 2; this.first(`SELECT 1 AS x FROM ${table} WHERE id = ?`, id); n++) id = `${base}-${n}`
    return id
  }
}

function inboxFromRow(r: Row): InboxEntry {
  return { ...(r as unknown as InboxEntry), observations: JSON.parse(String(r.observations ?? '[]')) }
}

function questionFromRow(r: Row): Question {
  return {
    ...(r as unknown as Question),
    inbox_ids: JSON.parse(String(r.inbox_ids ?? '[]')),
    options: JSON.parse(String(r.options ?? '[]')),
  }
}

function defaultPreposition(kind: string): string {
  return kind === 'shelf' || kind === 'furniture' || kind === 'fixture' ? 'on' : 'in'
}

function cap(s: string): string {
  const t = s.trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
