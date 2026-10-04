import type { Observation } from '../agent/observations'
import { TRACE_INDEX, TRACE_SCHEMA } from '../trace'
import { Inbox, Questions } from './inbox'
import { Items } from './items'
import { Locations } from './locations'
import { ADDED_COLUMNS, HOUSE_TABLES, SCHEMA_STATEMENTS, SCHEMA_VERSION } from './schema'
import { rank } from './search'
import { Sql } from './sql'
import type { InboxEntry, Item } from './types'

export * from './types'
export { slug } from './locations'

/**
 * One account's database. Each part has its own module:
 *   db.inbox      what was said (layer 1)
 *   db.questions  the agent's clarifying questions
 *   db.locations  places in the home (layer 2)
 *   db.items      things in the home (layer 2)
 * Agents and routes only ever go through these; nothing else writes SQL.
 */
export class HouseDb {
  readonly sql: Sql
  readonly inbox: Inbox
  readonly questions: Questions
  readonly locations: Locations
  readonly items: Items

  constructor(handle: SqlStorage, transaction: <T>(fn: () => T) => T) {
    this.sql = new Sql(handle, transaction)
    this.inbox = new Inbox(this.sql)
    this.questions = new Questions(this.sql)
    this.locations = new Locations(this.sql)
    this.items = new Items(this.sql)
  }

  /** Create any missing tables. Safe to run on every start. */
  migrate(): void {
    // Columns added in later versions go on first: an older database's views
    // and tables must have them before any statement below refers to them.
    for (const [table, column, definition] of ADDED_COLUMNS) {
      const exists = this.sql.first(`SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`, table)
      if (!exists) continue
      const has = this.sql.all<{ name: string }>(`SELECT name FROM pragma_table_info(?)`, table).some((c) => c.name === column)
      if (!has) this.sql.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
    for (const statement of SCHEMA_STATEMENTS) this.sql.run(statement)
    // Traces live here too, but stay out of house.sql (they're exported as their own files).
    this.sql.run(TRACE_SCHEMA)
    this.sql.run(TRACE_INDEX)
    this.sql.setMeta('schema_version', String(SCHEMA_VERSION))
  }

  /** An item as the agent and UI see it: where it is, in words, plus everything known about it. */
  describeItem(item: Item) {
    return {
      id: item.id,
      name: item.name,
      status: item.status,
      lent_to: item.lent_to,
      quantity: item.quantity,
      category: item.category,
      where: this.locations.describedPath(item.location_id) ?? item.location_note,
      preposition: item.location_id ? this.locations.get(item.location_id)?.preposition ?? null : null,
      aliases: this.items.aliases(item.id),
      details: this.items.details(item.id),
      ...(item.place_id ? { also_a_place: this.locations.describedPath(item.place_id) } : {}),
      updated_at: item.updated_at,
    }
  }

  /**
   * Fuzzy search for "where's my …". Looks in three places:
   *   items           — filed items (by name, alias, or detail like "red mixer")
   *   recent_unfiled  — observations not yet tidied into the house tables
   *   locations       — places whose name matches
   */
  search(query: string, limit = 8) {
    const searchableItems = this.items.all().map((item) => ({
      ...item,
      aliases: [...this.items.aliases(item.id), ...this.items.details(item.id).map((detail) => `${detail.value} ${item.name}`)],
    }))
    const items = rank(query, searchableItems)
      .slice(0, limit)
      .map((match) => ({ ...this.describeItem(match.item), score: round(match.score) }))

    const recent_unfiled = rank(query, this.unfiledObservations())
      .slice(0, limit)
      .map((match) => ({
        inbox_id: match.item.entry.id,
        at: match.item.entry.at,
        said: match.item.entry.said,
        observation: match.item.observation,
        score: round(match.score),
      }))

    const locations = this.locations
      .search(query)
      .slice(0, 4)
      .map((match) => ({ id: match.location.id, path: this.locations.describedPath(match.location.id), score: round(match.score) }))

    return { items, recent_unfiled, locations }
  }

  /**
   * A text outline of the house with ids — the map the agents see:
   *   - Garage [room, in] id=garage
   *     - Metal shelving [furniture, on] id=garage/metal-shelving
   *       • Extension cords item=extension-cords
   */
  outline(withItems: boolean): string {
    const locations = this.locations.all()
    const items = withItems ? this.items.all() : []
    const lines: string[] = []

    const describeItem = (item: Item) => {
      const quantity = item.quantity ? ` ×${item.quantity}` : ''
      const status = item.status !== 'present' ? ` (${item.status}${item.lent_to ? ` to ${item.lent_to}` : ''})` : ''
      return `${item.name}${quantity}${status} item=${item.id}`
    }
    const walk = (parentId: string | null, depth: number) => {
      const indent = '  '.repeat(depth)
      const children = locations.filter((l) => l.parent_id === parentId).sort((a, b) => a.name.localeCompare(b.name))
      for (const location of children) {
        const aliases = this.locations.aliases(location.id)
        const aka = aliases.length ? ` aka ${aliases.join(', ')}` : ''
        const position = location.position ? `, position: ${location.position}` : ''
        lines.push(`${indent}- ${location.name} [${location.kind}, ${location.preposition}${position}] id=${location.id}${aka}`)
        for (const item of items.filter((i) => i.location_id === location.id)) lines.push(`${indent}  • ${describeItem(item)}`)
        walk(location.id, depth + 1)
      }
    }
    walk(null, 0)

    for (const item of items.filter((i) => !i.location_id)) {
      lines.push(`• ${describeItem(item)} — ${item.location_note ?? 'location unknown'}`)
    }
    return lines.length ? lines.join('\n') : '(nothing recorded yet)'
  }

  /** Delete every layer-2 row (the inbox is kept, so the house can be rebuilt from it). */
  resetHouse(): void {
    this.sql.tx(() => {
      for (const table of [...HOUSE_TABLES].reverse()) this.sql.run(`DELETE FROM ${table}`)
    })
  }

  /** Item mentions in inbox entries that haven't been tidied into the house tables yet. */
  private unfiledObservations() {
    const waiting: InboxEntry[] = [...this.inbox.list('pending_compaction'), ...this.inbox.list('needs_clarification')]
    const mentions: { id: string; name: string; aliases: string[]; observation: Observation; entry: InboxEntry }[] = []
    for (const entry of waiting) {
      entry.observations.forEach((observation, index) => {
        if (!observation.item) return
        mentions.push({
          id: `${entry.id}#${index}`,
          name: observation.item,
          aliases: observation.related_item ? [observation.related_item] : [],
          observation,
          entry,
        })
      })
    }
    return mentions
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
