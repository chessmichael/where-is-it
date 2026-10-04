import { ITEM_STATUSES, LOCATION_KINDS, type HouseDb, type InboxEntry, type PathStep } from '../db/repo'
import type { LLMProvider, Msg } from '../llm/types'
import { runLoop, type AgentTool, type TraceStep } from './loop'
import { RELATIONS } from './observations'
import { COMPACT_SYSTEM } from './prompts'

// Folds pending inbox entries (layer 1) into the relational model (layer 2).
// Each tool call is its own SQLite transaction; entries are only marked
// compacted when the agent calls `finish`, so an interrupted run leaves them
// pending and the next run picks them up (upserts match existing rows).

interface Ctx {
  db: HouseDb
  pendingIds: Set<string>
  finished: { ids: string[]; summary: string } | null
  questions: string[]
}

const str = { type: 'string' }
const nul = (s: Record<string, unknown>) => ({ anyOf: [s, { type: 'null' }] })
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
})
const pathSchema = {
  type: 'array',
  description: 'Room first, then inward. Existing nodes are matched by name/alias at each level; missing ones are created.',
  items: obj({
    name: str,
    kind: nul({ type: 'string', enum: [...LOCATION_KINDS] }),
    preposition: nul(str),
  }),
}
const s = (v: unknown) => (v === null || v === undefined ? null : String(v))

const tools: AgentTool<Ctx>[] = [
  {
    def: {
      name: 'upsert_location',
      description: 'Ensure a location path exists (creating missing levels) and optionally set the leaf\'s description and aliases. Returns its id.',
      parameters: obj({ path: pathSchema, description: nul(str), aliases: { type: 'array', items: str } }),
    },
    run: (i, { db }) =>
      db.tx(() => {
        const id = db.ensurePath(i.path as PathStep[])
        db.updateLocation(id, { description: s(i.description), aliases: i.aliases as string[] })
        return { id, path: db.locationPath(id) }
      }),
  },
  {
    def: {
      name: 'update_location',
      description: 'Rename or re-describe an existing location by id. Null fields are left unchanged.',
      parameters: obj({
        location_id: str,
        name: nul(str),
        kind: nul({ type: 'string', enum: [...LOCATION_KINDS] }),
        preposition: nul(str),
        description: nul(str),
        aliases: { type: 'array', items: str },
      }),
    },
    run: (i, { db }) =>
      db.tx(() => {
        db.updateLocation(String(i.location_id), {
          name: s(i.name), kind: s(i.kind), preposition: s(i.preposition), description: s(i.description), aliases: i.aliases as string[],
        })
        return { ok: true, path: db.locationPath(String(i.location_id)) }
      }),
  },
  {
    def: {
      name: 'upsert_item',
      description:
        'Create (item_id null) or update an item. Location: give location_path (preferred, created as needed) or location_id, or location_note for places outside the house tree; all null keeps the current location. Null fields are left unchanged. Moves and status changes are logged to item history automatically.',
      parameters: obj({
        item_id: nul(str),
        name: str,
        category: nul(str),
        description: nul(str),
        quantity: nul({ type: 'integer' }),
        location_path: nul(pathSchema),
        location_id: nul(str),
        location_note: nul(str),
        status: nul({ type: 'string', enum: [...ITEM_STATUSES] }),
        lent_to: nul(str),
        aliases: { type: 'array', items: str },
        details: { type: 'array', items: obj({ key: str, value: str }) },
        inbox_id: nul({ ...str, description: 'The inbox entry this change comes from.' }),
      }),
    },
    run: (i, { db }) =>
      db.tx(() => {
        let locationId = s(i.location_id)
        if (locationId && !db.getLocation(locationId)) throw new Error(`no location ${locationId}`)
        if (i.location_path) locationId = db.ensurePath(i.location_path as PathStep[])
        const id = db.upsertItem({
          item_id: s(i.item_id),
          name: String(i.name),
          category: s(i.category),
          description: s(i.description),
          quantity: (i.quantity as number | null) ?? null,
          location_id: locationId,
          location_note: s(i.location_note),
          status: s(i.status),
          lent_to: s(i.lent_to),
          aliases: i.aliases as string[],
          details: i.details as { key: string; value: string }[],
          inbox_id: s(i.inbox_id),
        })
        return db.describeItem(db.getItem(id)!)
      }),
  },
  {
    def: {
      name: 'relate',
      description: 'Record a relationship between two existing items, e.g. charger part_of laptop.',
      parameters: obj({ subject_item_id: str, relation: { type: 'string', enum: [...RELATIONS] }, object_item_id: str, note: nul(str) }),
    },
    run: (i, { db }) => db.tx(() => (db.relate(String(i.subject_item_id), String(i.relation), String(i.object_item_id), s(i.note)), { ok: true })),
  },
  {
    def: {
      name: 'merge_items',
      description: 'Two item rows are the same thing: fold remove_id into keep_id (aliases, details, history and relationships move over).',
      parameters: obj({ keep_id: str, remove_id: str }),
    },
    run: (i, { db }) => db.tx(() => (db.mergeItems(String(i.keep_id), String(i.remove_id)), { ok: true })),
  },
  {
    def: {
      name: 'merge_locations',
      description: 'Two locations are the same place: fold remove_id into keep_id (children, items and aliases move over).',
      parameters: obj({ keep_id: str, remove_id: str }),
    },
    run: (i, { db }) => db.tx(() => (db.mergeLocations(String(i.keep_id), String(i.remove_id)), { ok: true })),
  },
  {
    def: {
      name: 'get_item',
      description: 'Full record for an item, including its move history.',
      parameters: obj({ item_id: str }),
    },
    run: ({ item_id }, { db }) => {
      const it = db.getItem(String(item_id))
      if (!it) throw new Error(`no item ${item_id}`)
      return { ...db.describeItem(it), history: db.history(it.id) }
    },
  },
  {
    def: {
      name: 'search_house',
      description: 'Fuzzy-search existing items and locations by name.',
      parameters: obj({ query: str }),
    },
    run: ({ query }, { db }) => {
      const r = db.search(String(query))
      return { items: r.items, locations: r.locations }
    },
  },
  {
    def: {
      name: 'ask_user',
      description: "Raise a question for the person when entries can't be filed safely. Those entries stay pending until answered.",
      parameters: obj({ question: str, options: { type: 'array', items: str }, inbox_ids: { type: 'array', items: str } }),
    },
    run: (i, ctx) =>
      ctx.db.tx(() => {
        const ids = (i.inbox_ids as string[]).filter((id) => ctx.pendingIds.has(id))
        const q = ctx.db.addQuestion({ conversation: null, inbox_ids: ids, question: String(i.question), options: (i.options as string[]).slice(0, 4) })
        for (const id of ids) ctx.db.updateInbox(id, { status: 'needs_clarification', note: `waiting on ${q.id}` })
        ctx.questions.push(q.id)
        return { asked: q.id }
      }),
  },
  {
    def: {
      name: 'finish',
      description: 'End the run. List every pending entry you fully filed (or that held nothing to store).',
      parameters: obj({ compacted_inbox_ids: { type: 'array', items: str }, summary: str }),
    },
    endsTurn: true,
    run: (i, ctx) => {
      const ids = (i.compacted_inbox_ids as string[]).filter((id) => ctx.pendingIds.has(id))
      ctx.finished = { ids, summary: String(i.summary) }
      return { compacted: ids.length }
    },
  },
]

export interface CompactResult {
  compacted: string[]
  questions: string[]
  summary: string
  steps: TraceStep[]
  messages: Msg[]
  stop: string
}

export async function compact(llm: LLMProvider, db: HouseDb, entries: InboxEntry[]): Promise<CompactResult> {
  const ctx: Ctx = { db, pendingIds: new Set(entries.map((e) => e.id)), finished: null, questions: [] }
  const answered = db
    .all<{ id: string; question: string; answer: string | null; inbox_ids: string }>(
      `SELECT id, question, answer, inbox_ids FROM questions WHERE status = 'answered' ORDER BY at DESC LIMIT 20`,
    )
  const input = [
    `<house_map>\n${db.outline(true)}\n</house_map>`,
    answered.length ? `<answered_questions>\n${answered.map((q) => `${q.id} (${q.inbox_ids}): ${q.question} → ${q.answer}`).join('\n')}\n</answered_questions>` : '',
    `<pending_entries>\n${entries
      .map((e) => JSON.stringify({ id: e.id, at: e.at, said: e.said, observations: e.observations, agent_reply: e.agent_reply, status: e.status }))
      .join('\n')}\n</pending_entries>`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const res = await runLoop({
    llm,
    system: COMPACT_SYSTEM,
    messages: [{ role: 'user', content: input }],
    tools,
    ctx,
    effort: 'medium',
    maxSteps: 30,
  })

  const t = new Date().toISOString()
  const compacted = ctx.finished?.ids ?? []
  db.tx(() => {
    for (const id of compacted) db.updateInbox(id, { status: 'compacted', compacted_at: t, note: null })
  })
  return {
    compacted,
    questions: ctx.questions,
    summary: ctx.finished?.summary ?? `Run ended without finishing (${res.stop}); entries left pending.`,
    steps: res.steps,
    messages: res.messages,
    stop: res.stop,
  }
}
