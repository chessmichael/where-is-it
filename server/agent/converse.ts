import type { HouseDb, InboxEntry, Question } from '../db/repo'
import type { LLMProvider, Msg } from '../llm/types'
import { runLoop, type AgentTool, type TraceStep } from './loop'
import { OBSERVATION_SCHEMA, type Observation } from './observations'
import { CONVERSE_SYSTEM } from './prompts'

// One conversational turn: utterance → (search / record / ask) → spoken reply.
// The utterance is already in the inbox when this runs.

interface Ctx {
  db: HouseDb
  entry: InboxEntry
  observations: Observation[]
  asked: Question | null
}

const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
})

const tools: AgentTool<Ctx>[] = [
  {
    def: {
      name: 'search_house',
      description:
        'Fuzzy-search the house for an item or place. Returns filed items with their full location path, recent not-yet-filed observations that mention it, and matching locations.',
      parameters: obj({ query: { type: 'string', description: 'What to look for, e.g. "passport" or "christmas lights".' } }),
    },
    run: ({ query }, { db }) => db.search(String(query)),
  },
  {
    def: {
      name: 'get_location',
      description: 'Everything stored in a place and its sub-places. Accepts a location id, a path like "Garage › Metal shelving", or a name.',
      parameters: obj({ location: { type: 'string' } }),
    },
    run: ({ location }, { db }) => {
      const loc = db.resolveLocation(String(location))
      if (!loc) throw new Error(`no location matching "${location}"`)
      return db.locationContents(loc.id)
    },
  },
  {
    def: {
      name: 'record_observations',
      description:
        "Attach structured observations to the current inbox entry. Call once per turn with everything the utterance establishes. Calling again replaces this turn's earlier observations.",
      parameters: obj({ observations: { type: 'array', items: OBSERVATION_SCHEMA } }),
    },
    run: ({ observations }, ctx) => {
      ctx.observations = observations as Observation[]
      return { recorded: ctx.observations.length, inbox_id: ctx.entry.id }
    },
  },
  {
    def: {
      name: 'resolve_question',
      description: 'Mark one of the open questions as answered (or dismissed if the person says it no longer matters).',
      parameters: obj({
        question_id: { type: 'string' },
        status: { type: 'string', enum: ['answered', 'dismissed'] },
        answer: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'The answer in your own words.' },
      }),
    },
    run: ({ question_id, status, answer }, { db, entry }) => {
      const q = db.getQuestion(String(question_id))
      if (!q || q.status !== 'open') throw new Error(`no open question ${question_id}`)
      db.resolveQuestion(q.id, status as 'answered' | 'dismissed', (answer as string | null) ?? entry.said, entry.id)
      return { ok: true }
    },
  },
  {
    def: {
      name: 'ask_user',
      description:
        'Ask the person one clarifying question. Ends your turn; the question is read aloud and their next utterance comes back to you. Record anything already certain before asking.',
      parameters: obj({
        question: { type: 'string', description: 'Short, spoken-style question.' },
        options: { type: 'array', items: { type: 'string' }, description: '0-4 short suggested answers.' },
      }),
    },
    endsTurn: true,
    run: ({ question, options }, ctx) => {
      ctx.asked = ctx.db.addQuestion({
        conversation: ctx.entry.conversation,
        inbox_ids: [ctx.entry.id],
        question: String(question),
        options: ((options as string[]) ?? []).slice(0, 4),
      })
      return { asked: ctx.asked.id }
    },
  },
]

export interface ConverseResult {
  reply: string
  question: Question | null
  observations: Observation[]
  steps: TraceStep[]
  messages: Msg[]
  stop: string
}

export async function converse(llm: LLMProvider, db: HouseDb, entry: InboxEntry): Promise<ConverseResult> {
  const ctx: Ctx = { db, entry, observations: [], asked: null }
  const res = await runLoop({
    llm,
    system: CONVERSE_SYSTEM,
    messages: [{ role: 'user', content: turnContext(db, entry) }],
    tools,
    ctx,
    effort: 'low',
    maxSteps: 8,
  })
  let reply = res.text.trim()
  if (ctx.asked) reply = ctx.asked.question
  if (!reply) {
    reply =
      res.stop === 'refusal'
        ? "Sorry, I can't help with that one."
        : ctx.observations.length
          ? 'Got it.'
          : "Sorry, I didn't catch that — could you say it again?"
  }
  return { reply, question: ctx.asked, observations: ctx.observations, steps: res.steps, messages: res.messages, stop: res.stop }
}

// Volatile context for this turn: map, open questions, recent exchanges.
function turnContext(db: HouseDb, entry: InboxEntry): string {
  const history = db.conversationHistory(entry.conversation, entry.id)
  const open = db.openQuestions()
  const parts = [
    `<house_map>\n${db.outline(false)}\n</house_map>`,
    open.length
      ? `<open_questions>\n${open.map((q) => `${q.id}: ${q.question}${q.options.length ? ` (options: ${q.options.join(' / ')})` : ''}`).join('\n')}\n</open_questions>`
      : '',
    history.length
      ? `<conversation_so_far>\n${history.map((h) => `[${h.id}] person: ${h.said}\nyou: ${h.agent_reply ?? ''}`).join('\n')}\n</conversation_so_far>`
      : '',
    `<now>${entry.at}</now>`,
    `[${entry.id}] person: ${entry.said}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}
