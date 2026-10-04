import type { HouseDb, LocationRow } from './repo'
import { HOUSE_TABLES, SCHEMA_STATEMENTS } from './schema'

// Human-readable exports of one account's data. These are the "files" the
// person can download and read directly.

export const EXPORT_FILES = {
  'inbox.jsonl': 'Every utterance, verbatim, with what the agent made of it (one JSON object per line).',
  'questions.json': 'Clarifying questions the agent asked, open and answered.',
  'house.md': 'The compacted house as a readable outline: rooms, storage, items.',
  'house.json': 'The compacted house as a nested JSON tree.',
  'house.sql': 'The whole database as SQL (load with: sqlite3 house.db < house.sql).',
} as const
export type ExportName = keyof typeof EXPORT_FILES

export function renderExport(db: HouseDb, name: ExportName): { body: string; type: string } {
  switch (name) {
    case 'inbox.jsonl':
      return { body: db.listInbox().map((e) => JSON.stringify(e)).join('\n') + '\n', type: 'application/x-ndjson' }
    case 'questions.json':
      return { body: json(db.all('SELECT * FROM questions ORDER BY at').map(parseJsonCols)), type: 'application/json' }
    case 'house.json':
      return { body: json(houseTree(db)), type: 'application/json' }
    case 'house.md':
      return { body: houseMarkdown(db), type: 'text/markdown; charset=utf-8' }
    case 'house.sql':
      return { body: sqlDump(db), type: 'application/sql' }
  }
}

export function houseTree(db: HouseDb) {
  const locs = db.locations()
  const items = db.items()
  const node = (l: LocationRow): unknown => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    preposition: l.preposition,
    ...(l.description ? { description: l.description } : {}),
    ...(db.locationAliases(l.id).length ? { aliases: db.locationAliases(l.id) } : {}),
    items: items.filter((i) => i.location_id === l.id).map((i) => itemJson(db, i.id)),
    children: locs.filter((c) => c.parent_id === l.id).map(node),
  })
  return {
    rooms: locs.filter((l) => !l.parent_id).map(node),
    elsewhere: items.filter((i) => !i.location_id).map((i) => itemJson(db, i.id)),
    relationships: db.relationships(),
    pending_inbox_entries: db.listInbox({ status: 'pending_compaction' }).length,
  }
}

function itemJson(db: HouseDb, id: string) {
  const d = db.describeItem(db.getItem(id)!)
  const { where: _w, preposition: _p, ...rest } = d
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && !(Array.isArray(v) && v.length === 0)))
}

export function houseMarkdown(db: HouseDb): string {
  const locs = db.locations()
  const items = db.items()
  const counts = db.countByStatus()
  const out: string[] = [
    '# House inventory',
    '',
    `_Generated ${new Date().toISOString()}. ${items.length} items in ${locs.length} places._`,
  ]
  if (counts.pending_compaction) out.push(`_${counts.pending_compaction} recent entries not filed yet — see inbox.jsonl._`)
  const itemLine = (i: (typeof items)[number]) => {
    const details = db.itemDetails(i.id).map((d) => `${d.key}: ${d.value}`)
    const extra = [
      i.quantity ? `×${i.quantity}` : '',
      i.status !== 'present' ? `**${i.status}**${i.lent_to ? ` to ${i.lent_to}` : ''}` : '',
      details.length ? `(${details.join(', ')})` : '',
    ].filter(Boolean)
    return `${i.name}${extra.length ? ' ' + extra.join(' ') : ''}`
  }
  const walk = (parent: string, depth: number) => {
    for (const l of locs.filter((x) => x.parent_id === parent)) {
      out.push(`${'  '.repeat(depth)}- **${l.name}** _(${l.kind})_${l.description ? ` — ${l.description}` : ''}`)
      for (const i of items.filter((x) => x.location_id === l.id)) out.push(`${'  '.repeat(depth + 1)}- ${itemLine(i)}`)
      walk(l.id, depth + 1)
    }
  }
  for (const room of locs.filter((l) => !l.parent_id)) {
    out.push('', `## ${room.name}`, '')
    for (const i of items.filter((x) => x.location_id === room.id)) out.push(`- ${itemLine(i)}`)
    walk(room.id, 0)
  }
  const loose = items.filter((i) => !i.location_id)
  if (loose.length) {
    out.push('', '## Elsewhere', '')
    for (const i of loose) out.push(`- ${itemLine(i)} — ${i.location_note ?? 'location unknown'}`)
  }
  const rels = db.relationships()
  if (rels.length) {
    out.push('', '## Relationships', '')
    for (const r of rels) out.push(`- ${r.subject_item_id} _${r.relation.replace('_', ' ')}_ ${r.object_item_id}${r.note ? ` — ${r.note}` : ''}`)
  }
  return out.join('\n') + '\n'
}

export function sqlDump(db: HouseDb): string {
  const out = ['-- Where Is It: full database export', `-- Generated ${new Date().toISOString()}`, 'PRAGMA foreign_keys = OFF;', 'BEGIN;', '']
  out.push(...SCHEMA_STATEMENTS, '')
  for (const table of ['meta', 'inbox', 'questions', ...HOUSE_TABLES]) {
    const rows = db.all(`SELECT * FROM ${table}`)
    if (!rows.length) continue
    out.push(`-- ${table}`)
    for (const r of rows) {
      const cols = Object.keys(r)
      out.push(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => sqlValue(r[c])).join(', ')});`)
    }
    out.push('')
  }
  out.push('COMMIT;')
  return out.join('\n') + '\n'
}

function sqlValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (v instanceof ArrayBuffer) return `X'${[...new Uint8Array(v)].map((b) => b.toString(16).padStart(2, '0')).join('')}'`
  return `'${String(v).replace(/'/g, "''")}'`
}

function parseJsonCols(r: Record<string, unknown>) {
  const out = { ...r }
  for (const k of ['inbox_ids', 'options']) if (typeof out[k] === 'string') out[k] = JSON.parse(out[k] as string)
  return out
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'
