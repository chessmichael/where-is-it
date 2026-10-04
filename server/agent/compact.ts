import { ITEM_STATUSES, LOCATION_KINDS, type Detail, type HouseDb, type InboxEntry, type PathStep } from '../db/house'
import type { LLMProvider, Msg } from '../llm/types'
import { runLoop, type AgentTool, type TraceStep } from './loop'
import { RELATIONS } from './observations'
import { COMPACT_SYSTEM } from './prompts'
import { boolean, integer, listOf, nullable, object, oneOf, text, textList, textOrNull, textWith } from './schema'

// The tidy-up agent: folds pending inbox entries (layer 1) into the house
// tables (layer 2).
//
// Safety: each tool call is its own transaction, and entries are only marked
// "compacted" when the agent calls `finish`. If a run is interrupted, the
// entries stay pending and the next run picks them up; because the tools
// match existing rows, re-filing something doesn't create duplicates.

interface RunState {
  db: HouseDb
  pendingIds: Set<string> // the entries this run was given
  finished: { ids: string[]; summary: string } | null
  questionsAsked: string[]
}

// A location path as the agent writes it: [{name: "Garage"}, {name: "Top shelf", kind: "shelf"}, ...]
const locationPath = listOf(
  object({ name: text, kind: nullable(oneOf(LOCATION_KINDS)), preposition: nullable(text) }),
  'Room first, then inward. Existing nodes are matched by name/alias at each level; missing ones are created.',
)

// ── Tools ──────────────────────────────────────────────────────────────────

const upsertLocation: AgentTool<RunState> = {
  def: {
    name: 'upsert_location',
    description:
      "Ensure a location path exists (creating missing levels) and optionally set the leaf's description, position and aliases. Set also_an_item when the leaf is something the person owns and might ask for by name (a toolbox, a tote, a suitcase): it's then also filed as an item at its parent, kept in sync when either moves. Returns its id.",
    parameters: object({
      path: locationPath,
      description: nullable(text),
      position: nullable(textWith('Where it sits among its neighbors: "left", "top of the stack", "closest to the door".')),
      aliases: listOf(text),
      also_an_item: boolean,
      inbox_id: nullable(text),
    }),
  },
  run: (input, { db }) =>
    db.sql.tx(() => {
      const id = db.locations.ensurePath(input.path as PathStep[])
      const inboxId = textOrNull(input.inbox_id)
      db.locations.update(id, { description: textOrNull(input.description), position: textOrNull(input.position), aliases: textList(input.aliases) }, inboxId)
      if (input.also_an_item) linkItemToPlace(db, id, inboxId)
      return { id, path: db.locations.describedPath(id) }
    }),
}

/** File a place as an item too (at its parent), reusing a same-named item already there. */
function linkItemToPlace(db: HouseDb, placeId: string, inboxId: string | null) {
  const place = db.locations.get(placeId)!
  if (db.items.all().some((it) => it.place_id === placeId)) return
  const sameName = db.items.all().find((it) => it.location_id === place.parent_id && it.name.toLowerCase() === place.name.toLowerCase())
  if (sameName) db.items.save(sameName.id, { name: sameName.name, place_id: placeId, inbox_id: inboxId })
  else db.items.save(null, { name: place.name, location_id: place.parent_id, place_id: placeId, inbox_id: inboxId })
}

const moveLocation: AgentTool<RunState> = {
  def: {
    name: 'move_location',
    description:
      'Move a place — and therefore everything in it — under a new parent ("I moved the red tote to the attic"). Give new_parent_path (created as needed) or new_parent_id. Optionally set its new position. Use this instead of moving its contents one by one.',
    parameters: object({
      location_id: text,
      new_parent_path: nullable(locationPath),
      new_parent_id: nullable(text),
      position: nullable(text),
      inbox_id: nullable(text),
    }),
  },
  run: (input, { db }) =>
    db.sql.tx(() => {
      const id = String(input.location_id)
      let parentId = textOrNull(input.new_parent_id)
      if (input.new_parent_path) parentId = db.locations.ensurePath(input.new_parent_path as PathStep[])
      if (!parentId) throw new Error('give new_parent_path or new_parent_id')
      db.locations.move(id, parentId, textOrNull(input.position), textOrNull(input.inbox_id))
      return { ok: true, path: db.locations.describedPath(id) }
    }),
}

const updateLocation: AgentTool<RunState> = {
  def: {
    name: 'update_location',
    description: 'Rename, re-describe or re-position an existing location by id (e.g. a reordered stack: set each box\'s new position). Null fields are left unchanged.',
    parameters: object({
      location_id: text,
      name: nullable(text),
      kind: nullable(oneOf(LOCATION_KINDS)),
      preposition: nullable(text),
      description: nullable(text),
      position: nullable(text),
      aliases: listOf(text),
      inbox_id: nullable(text),
    }),
  },
  run: (input, { db }) =>
    db.sql.tx(() => {
      const id = String(input.location_id)
      db.locations.update(
        id,
        {
          name: textOrNull(input.name),
          kind: textOrNull(input.kind),
          preposition: textOrNull(input.preposition),
          description: textOrNull(input.description),
          position: textOrNull(input.position),
          aliases: textList(input.aliases),
        },
        textOrNull(input.inbox_id),
      )
      return { ok: true, path: db.locations.describedPath(id) }
    }),
}

const upsertItem: AgentTool<RunState> = {
  def: {
    name: 'upsert_item',
    description:
      'Create (item_id null) or update an item. Location: give location_path (preferred, created as needed) or location_id, or location_note for places outside the house tree; all null keeps the current location. Null fields are left unchanged. Moves and status changes are logged to item history automatically.',
    parameters: object({
      item_id: nullable(text),
      name: text,
      category: nullable(text),
      description: nullable(text),
      quantity: nullable(integer),
      location_path: nullable(locationPath),
      location_id: nullable(text),
      location_note: nullable(text),
      status: nullable(oneOf(ITEM_STATUSES)),
      lent_to: nullable(text),
      aliases: listOf(text),
      details: listOf(object({ key: text, value: text })),
      inbox_id: nullable(textWith('The inbox entry this change comes from.')),
    }),
  },
  run: (input, { db }) =>
    db.sql.tx(() => {
      // Where is it? A path (created as needed) wins over an id.
      let locationId = textOrNull(input.location_id)
      if (locationId && !db.locations.get(locationId)) throw new Error(`no location ${locationId}`)
      if (input.location_path) locationId = db.locations.ensurePath(input.location_path as PathStep[])

      const id = db.items.save(textOrNull(input.item_id), {
        name: String(input.name),
        category: textOrNull(input.category),
        description: textOrNull(input.description),
        quantity: (input.quantity as number | null) ?? null,
        location_id: locationId,
        location_note: textOrNull(input.location_note),
        status: textOrNull(input.status),
        lent_to: textOrNull(input.lent_to),
        aliases: textList(input.aliases),
        details: (input.details as Detail[]) ?? [],
        inbox_id: textOrNull(input.inbox_id),
      })
      return db.describeItem(db.items.get(id)!)
    }),
}

const relate: AgentTool<RunState> = {
  def: {
    name: 'relate',
    description: 'Record a relationship between two existing items, e.g. charger part_of laptop.',
    parameters: object({ subject_item_id: text, relation: oneOf(RELATIONS), object_item_id: text, note: nullable(text) }),
  },
  run: (input, { db }) =>
    db.sql.tx(() => {
      db.items.relate(String(input.subject_item_id), String(input.relation), String(input.object_item_id), textOrNull(input.note))
      return { ok: true }
    }),
}

const mergeItems: AgentTool<RunState> = {
  def: {
    name: 'merge_items',
    description: 'Two item rows are the same thing: fold remove_id into keep_id (aliases, details, history and relationships move over).',
    parameters: object({ keep_id: text, remove_id: text }),
  },
  run: (input, { db }) =>
    db.sql.tx(() => {
      db.items.merge(String(input.keep_id), String(input.remove_id))
      return { ok: true }
    }),
}

const mergeLocations: AgentTool<RunState> = {
  def: {
    name: 'merge_locations',
    description: 'Two locations are the same place: fold remove_id into keep_id (children, items and aliases move over).',
    parameters: object({ keep_id: text, remove_id: text }),
  },
  run: (input, { db }) =>
    db.sql.tx(() => {
      db.locations.merge(String(input.keep_id), String(input.remove_id))
      return { ok: true }
    }),
}

const getItem: AgentTool<RunState> = {
  def: {
    name: 'get_item',
    description: 'Full record for an item, including its move history.',
    parameters: object({ item_id: text }),
  },
  run: (input, { db }) => {
    const item = db.items.get(String(input.item_id))
    if (!item) throw new Error(`no item ${input.item_id}`)
    return { ...db.describeItem(item), history: db.items.history(item.id) }
  },
}

const searchHouse: AgentTool<RunState> = {
  def: {
    name: 'search_house',
    description: 'Fuzzy-search existing items and locations by name.',
    parameters: object({ query: text }),
  },
  run: (input, { db }) => {
    const results = db.search(String(input.query))
    return { items: results.items, locations: results.locations }
  },
}

const askUser: AgentTool<RunState> = {
  def: {
    name: 'ask_user',
    description: "Raise a question for the person when entries can't be filed safely. Those entries stay pending until answered.",
    parameters: object({ question: text, options: listOf(text), inbox_ids: listOf(text) }),
  },
  run: (input, state) =>
    state.db.sql.tx(() => {
      const heldBack = textList(input.inbox_ids).filter((id) => state.pendingIds.has(id))
      const question = state.db.questions.ask({
        conversation: null,
        inbox_ids: heldBack,
        question: String(input.question),
        options: textList(input.options).slice(0, 4),
      })
      for (const id of heldBack) state.db.inbox.update(id, { status: 'needs_clarification', note: `waiting on ${question.id}` })
      state.questionsAsked.push(question.id)
      return { asked: question.id }
    }),
}

const finish: AgentTool<RunState> = {
  def: {
    name: 'finish',
    description: 'End the run. List every pending entry you fully filed (or that held nothing to store).',
    parameters: object({ compacted_inbox_ids: listOf(text), summary: text }),
  },
  endsTurn: true,
  run: (input, state) => {
    const filed = textList(input.compacted_inbox_ids).filter((id) => state.pendingIds.has(id))
    state.finished = { ids: filed, summary: String(input.summary) }
    return { compacted: filed.length }
  },
}

const TOOLS = [upsertLocation, updateLocation, moveLocation, upsertItem, relate, mergeItems, mergeLocations, getItem, searchHouse, askUser, finish]

// ── The run ────────────────────────────────────────────────────────────────

export interface CompactResult {
  compacted: string[]
  questions: string[]
  summary: string
  steps: TraceStep[]
  messages: Msg[]
  stop: string
}

export async function compact(llm: LLMProvider, db: HouseDb, entries: InboxEntry[]): Promise<CompactResult> {
  const state: RunState = { db, pendingIds: new Set(entries.map((e) => e.id)), finished: null, questionsAsked: [] }

  const result = await runLoop({
    llm,
    system: COMPACT_SYSTEM,
    messages: [{ role: 'user', content: describeWork(db, entries) }],
    tools: TOOLS,
    ctx: state,
    effort: 'medium',
    maxSteps: 30,
  })

  // Only entries the agent explicitly finished are marked compacted.
  const filed = state.finished?.ids ?? []
  const filedAt = new Date().toISOString()
  db.sql.tx(() => {
    for (const id of filed) db.inbox.update(id, { status: 'compacted', compacted_at: filedAt, note: null })
  })

  return {
    compacted: filed,
    questions: state.questionsAsked,
    summary: state.finished?.summary ?? `Run ended without finishing (${result.stop}); entries left pending.`,
    steps: result.steps,
    messages: result.messages,
    stop: result.stop,
  }
}

/** The agent's input: the current house, recent answers to questions, and the entries to file. */
function describeWork(db: HouseDb, entries: InboxEntry[]): string {
  const houseMap = `<house_map>\n${db.outline(true)}\n</house_map>`

  const answered = db.questions.recentlyAnswered()
  const answers = answered.length
    ? `<answered_questions>\n${answered.map((q) => `${q.id} (${JSON.stringify(q.inbox_ids)}): ${q.question} → ${q.answer}`).join('\n')}\n</answered_questions>`
    : ''

  const pending = entries
    .map((e) => JSON.stringify({ id: e.id, at: e.at, said: e.said, observations: e.observations, agent_reply: e.agent_reply, status: e.status }))
    .join('\n')

  return [houseMap, answers, `<pending_entries>\n${pending}\n</pending_entries>`].filter(Boolean).join('\n\n')
}
