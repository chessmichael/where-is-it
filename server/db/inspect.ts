import type { HouseDb } from './house'
import { normalize } from './search'
import { HOUSE_TABLES, SCHEMA } from './schema'
import type { InboxEntry, Item, Location } from './types'

// Reads one house and explains it: the structure (tables and columns in plain
// words), the house as a tree, each item's story (every placement, move and
// loan, with the words that caused it), and health checks that point at data
// a person would find confusing. Pure data — inspect-html.ts renders it, both
// in the app (/api/inspect) and locally (npm run inspect).

export interface InspectReport {
  generatedAt: string
  counts: Record<string, number>
  structure: TableDoc[]
  tree: PlaceNode[]
  elsewhere: ItemView[]
  stories: ItemStory[]
  inbox: { id: string; at: string; said: string; status: string; reply: string | null; recorded: number }[]
  openQuestions: { id: string; question: string; options: string[]; from: string }[]
  health: HealthFinding[]
}

export interface TableDoc {
  name: string
  layer: 'what was said' | 'the house' | 'history' | 'bookkeeping'
  purpose: string
  rows: number
  columns: { name: string; type: string; meaning: string; linksTo: string | null }[]
}

export interface ItemView {
  id: string
  name: string
  status: string
  quantity: number | null
  lentTo: string | null
  details: string[]
  aliases: string[]
  isAlsoPlace: boolean
  note: string | null
}

export interface PlaceNode {
  id: string
  name: string
  kind: string
  position: string | null
  description: string | null
  aliases: string[]
  isAlsoItem: boolean
  items: ItemView[]
  children: PlaceNode[]
}

export interface StoryEvent {
  at: string
  what: string // "Placed at …", "Moved from … to …", "Its container Red tote moved to …"
  said: string | null // the person's words that caused it, when known
  inboxId: string | null
}

export interface ItemStory {
  id: string
  name: string
  now: string
  events: StoryEvent[]
}

export interface HealthFinding {
  level: 'warning' | 'note'
  check: string
  detail: string
}

const TABLE_DOCS: Record<string, { layer: TableDoc['layer']; purpose: string }> = {
  inbox: { layer: 'what was said', purpose: 'Every utterance, word for word, plus what the conversation agent understood from it. Nothing here is ever rewritten except its status.' },
  questions: { layer: 'what was said', purpose: 'Clarifying questions the agents asked, and the answers.' },
  locations: { layer: 'the house', purpose: 'Every place, as a tree: rooms contain furniture and storage, which contain shelves and drawers, which contain containers. A place’s full address comes from walking up its parents.' },
  location_aliases: { layer: 'the house', purpose: 'Other names people use for a place (“the garage shelves”).' },
  items: { layer: 'the house', purpose: 'Every thing. Each sits in exactly one place — the one directly holding it — so its address is inherited from that place. A thing that also holds things (a toolbox) points to the place it is.' },
  item_aliases: { layer: 'the house', purpose: 'Other names for an item.' },
  item_details: { layer: 'the house', purpose: 'Lasting facts about an item: brand, color, size, material.' },
  relationships: { layer: 'the house', purpose: 'Links between items: part of, goes with, stored with, replacement for.' },
  item_history: { layer: 'history', purpose: 'Every time an item was placed, moved, lent, returned, lost or found — with the utterance that caused it.' },
  location_history: { layer: 'history', purpose: 'Every time a place moved (the red tote went to the attic) or changed position (a box went to the top of the stack).' },
  meta: { layer: 'bookkeeping', purpose: 'Small settings and counters (schema version, id counters).' },
}

/** Column meanings, read from the comments in schema.ts so they never drift from the real schema. */
function parseSchema(): Map<string, { name: string; type: string; meaning: string; linksTo: string | null }[]> {
  const tables = new Map<string, { name: string; type: string; meaning: string; linksTo: string | null }[]>()
  for (const block of SCHEMA.split(/CREATE TABLE IF NOT EXISTS /).slice(1)) {
    const name = block.slice(0, block.indexOf(' ')).trim()
    const body = block.slice(block.indexOf('(') + 1, block.lastIndexOf(');'))
    const columns = []
    for (const raw of body.split('\n')) {
      const line = raw.trim()
      if (!line || line.startsWith('PRIMARY KEY') || line.startsWith('--')) continue
      const [code, comment] = line.split(/\s--\s?/)
      const m = code.match(/^(\w+)\s+(\w+)/)
      if (!m) continue
      const ref = code.match(/REFERENCES (\w+)\((\w+)\)/)
      columns.push({ name: m[1], type: m[2], meaning: (comment ?? '').trim(), linksTo: ref ? `${ref[1]}.${ref[2]}` : null })
    }
    tables.set(name, columns)
  }
  return tables
}

export function inspectHouse(db: HouseDb): InspectReport {
  const locations = db.locations.all()
  const items = db.items.all()
  const inboxEntries = db.inbox.list()
  const inboxById = new Map(inboxEntries.map((e) => [e.id, e]))
  const pathOf = (id: string | null) => db.locations.describedPath(id) ?? '(no place)'

  // ── structure ──
  const schema = parseSchema()
  const counts: Record<string, number> = {}
  const structure: TableDoc[] = []
  for (const name of ['inbox', 'questions', ...HOUSE_TABLES, 'meta']) {
    const rows = db.sql.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${name}`)?.n ?? 0
    counts[name] = rows
    const doc = TABLE_DOCS[name] ?? { layer: 'bookkeeping' as const, purpose: '' }
    structure.push({ name, ...doc, rows, columns: schema.get(name) ?? [] })
  }

  // ── tree ──
  const view = (it: Item): ItemView => ({
    id: it.id,
    name: it.name,
    status: it.status,
    quantity: it.quantity,
    lentTo: it.lent_to,
    details: db.items.details(it.id).map((d) => `${d.key}: ${d.value}`),
    aliases: db.items.aliases(it.id),
    isAlsoPlace: Boolean(it.place_id),
    note: it.location_note,
  })
  const placeLinked = new Set(items.map((it) => it.place_id).filter(Boolean))
  const build = (loc: Location): PlaceNode => ({
    id: loc.id,
    name: loc.name,
    kind: loc.kind,
    position: loc.position,
    description: loc.description,
    aliases: db.locations.aliases(loc.id),
    isAlsoItem: placeLinked.has(loc.id),
    items: items.filter((it) => it.location_id === loc.id && it.place_id === null).map(view),
    children: locations.filter((c) => c.parent_id === loc.id).sort((a, b) => a.name.localeCompare(b.name)).map(build),
  })
  const tree = locations.filter((l) => !l.parent_id).sort((a, b) => a.name.localeCompare(b.name)).map(build)
  const elsewhere = items.filter((it) => !it.location_id).map(view)

  // ── stories ──
  const said = (inboxId: string | null) => (inboxId ? inboxById.get(inboxId)?.said ?? null : null)
  const stories: ItemStory[] = items.map((it) => {
    const events: StoryEvent[] = db.items.history(it.id).map((h: any) => ({
      at: String(h.at),
      what: describeItemEvent(h, pathOf),
      said: said(h.inbox_id as string | null),
      inboxId: (h.inbox_id as string | null) ?? null,
    }))
    // Moves of the places that hold it count too: the tote moving carried it along.
    for (const ancestor of ancestorsOf(db, it.location_id)) {
      for (const h of db.locations.history(ancestor.id) as any[]) {
        events.push({
          at: String(h.at),
          what:
            h.event === 'moved'
              ? `Its ${ancestor.id === it.location_id ? 'container' : 'surroundings'} “${ancestor.name}” moved from ${pathOf(h.from_parent_id)} to ${pathOf(h.to_parent_id)}`
              : `Its ${ancestor.id === it.location_id ? 'container' : 'surroundings'} “${ancestor.name}” changed position: ${h.from_position ?? 'none'} → ${h.to_position}`,
          said: said(h.inbox_id),
          inboxId: h.inbox_id ?? null,
        })
      }
    }
    events.sort((a, b) => a.at.localeCompare(b.at))
    const now = it.location_id ? pathOf(it.location_id) : it.location_note ?? 'location unknown'
    return { id: it.id, name: it.name, now: it.status === 'present' ? now : `${it.status}${it.lent_to ? ` to ${it.lent_to}` : ''} (last: ${now})`, events }
  })

  // ── what was said ──
  const inbox = inboxEntries.map((e: InboxEntry) => ({
    id: e.id,
    at: e.at,
    said: e.said,
    status: e.status,
    reply: e.agent_reply,
    recorded: e.observations.length,
  }))
  const openQuestions = db.questions.open().map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options,
    from: q.conversation ? 'conversation' : 'tidy-up',
  }))

  return { generatedAt: new Date().toISOString(), counts, structure, tree, elsewhere, stories, inbox, openQuestions, health: healthChecks(db, locations, items, inboxEntries) }
}

function describeItemEvent(h: Record<string, any>, pathOf: (id: string | null) => string): string {
  switch (h.event) {
    case 'placed': return `Placed at ${pathOf(h.to_location_id)}`
    case 'moved': return `Moved from ${pathOf(h.from_location_id)} to ${pathOf(h.to_location_id)}`
    case 'lent': return 'Lent out'
    case 'returned': return `Returned, now at ${pathOf(h.to_location_id)}`
    case 'gone': return 'Marked gone'
    case 'lost': return 'Marked lost'
    case 'found': return `Found, at ${pathOf(h.to_location_id)}`
    default: return String(h.event)
  }
}

function ancestorsOf(db: HouseDb, id: string | null): Location[] {
  const chain: Location[] = []
  for (let loc = id ? db.locations.get(id) : null; loc; loc = loc.parent_id ? db.locations.get(loc.parent_id) : null) chain.push(loc)
  return chain
}

const POSITION_WORDS = /\b(top|bottom|middle|upper|lower|left|right|first|second|third|fourth|1st|2nd|3rd|4th|front|back)\b/i

function healthChecks(db: HouseDb, locations: Location[], items: Item[], inbox: InboxEntry[]): HealthFinding[] {
  const findings: HealthFinding[] = []
  const pathOf = (id: string | null) => db.locations.describedPath(id) ?? '(nowhere)'
  const groupBy = <T>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>()
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x])
    return m
  }

  // Two neighbors claiming the same position ("top of the stack" twice).
  for (const siblings of groupBy(locations.filter((l) => l.position), (l) => `${l.parent_id}|${normalize(l.position!)}`).values()) {
    if (siblings.length > 1) {
      findings.push({ level: 'warning', check: 'Same position twice', detail: `${siblings.map((s) => `“${s.name}”`).join(' and ')} in ${pathOf(siblings[0].parent_id)} are both “${siblings[0].position}”.` })
    }
  }

  // Containers / units named by where they sit — breaks as soon as they're rearranged.
  for (const loc of locations) {
    if (loc.kind === 'shelf' || loc.kind === 'room' || loc.kind === 'area') continue // "Top shelf" is a fixed part, fine
    if (POSITION_WORDS.test(loc.name)) {
      findings.push({ level: 'warning', check: 'Named by position', detail: `“${loc.name}” (${pathOf(loc.id)}) is named by where it sits. If it's moved or the stack is reordered, the name will be wrong — name it by what it is, and use its position field.` })
    }
  }

  // Same-named things in the same spot are probably duplicates.
  for (const group of groupBy(items, (it) => `${it.location_id}|${normalize(it.name)}`).values()) {
    if (group.length > 1) findings.push({ level: 'warning', check: 'Possible duplicate items', detail: `${group.length} items named “${group[0].name}” in ${pathOf(group[0].location_id)}.` })
  }
  for (const group of groupBy(locations, (l) => `${l.parent_id}|${normalize(l.name)}`).values()) {
    if (group.length > 1) findings.push({ level: 'warning', check: 'Possible duplicate places', detail: `${group.length} places named “${group[0].name}” in ${pathOf(group[0].parent_id)}.` })
  }

  // An item that is also a place should sit where its place sits.
  for (const it of items.filter((i) => i.place_id)) {
    const place = db.locations.get(it.place_id!)
    if (place && place.parent_id !== it.location_id) {
      findings.push({ level: 'warning', check: 'Item and its place disagree', detail: `“${it.name}” is filed at ${pathOf(it.location_id)} but the place it is sits in ${pathOf(place.parent_id)}.` })
    }
  }

  // Things that can't be found.
  for (const it of items.filter((i) => !i.location_id && !i.location_note && i.status === 'present')) {
    findings.push({ level: 'warning', check: 'No location', detail: `“${it.name}” has no place and no note about where it is.` })
  }

  // Worth knowing, not wrong.
  for (const group of groupBy(items.filter((i) => i.status !== 'gone'), (it) => normalize(it.name)).values()) {
    if (group.length > 1 && new Set(group.map((g) => g.location_id)).size > 1) {
      findings.push({ level: 'note', check: 'Same name in different places', detail: `${group.length} × “${group[0].name}”: ${group.map((g) => pathOf(g.location_id)).join('; ')}. Asking for “the ${group[0].name}” is ambiguous.` })
    }
  }
  const pending = inbox.filter((e) => e.status === 'pending_compaction' || e.status === 'needs_clarification' || e.status === 'error')
  if (pending.length) findings.push({ level: 'note', check: 'Not filed yet', detail: `${pending.length} utterance(s) waiting for tidy-up or an answer.` })
  const open = db.questions.open()
  if (open.length) findings.push({ level: 'note', check: 'Open questions', detail: `${open.length} question(s) waiting for an answer.` })
  const used = new Set([...items.map((i) => i.location_id), ...locations.map((l) => l.parent_id), ...items.map((i) => i.place_id)])
  const empty = locations.filter((l) => !used.has(l.id))
  if (empty.length) findings.push({ level: 'note', check: 'Empty places', detail: `${empty.length} place(s) hold nothing: ${empty.slice(0, 12).map((l) => pathOf(l.id)).join('; ')}${empty.length > 12 ? '; …' : ''}.` })

  return findings
}
