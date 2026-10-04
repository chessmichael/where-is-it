import type { HouseDb, InboxEntry, Question } from '../db/house'
import type { LLMProvider, Msg } from '../llm/types'
import { runLoop, type AgentTool, type TraceStep } from './loop'
import { OBSERVATION_SCHEMA, type Observation } from './observations'
import { CONVERSE_SYSTEM } from './prompts'
import { listOf, nullable, object, oneOf, text, textList, textOrNull, textWith } from './schema'

// The conversation agent: one turn of utterance → (search / record / ask) →
// spoken reply. The utterance is already saved in the inbox when this runs;
// this decides what it means.

interface TurnState {
  db: HouseDb
  entry: InboxEntry // the utterance being handled
  observations: Observation[] // what record_observations captured
  asked: Question | null // set if the agent asked a clarifying question
}

// ── Tools ──────────────────────────────────────────────────────────────────

const searchHouse: AgentTool<TurnState> = {
  def: {
    name: 'search_house',
    description:
      'Fuzzy-search the house for an item or place. Returns filed items with their full location path, recent not-yet-filed observations that mention it, and matching locations.',
    parameters: object({ query: textWith('What to look for, e.g. "passport" or "christmas lights".') }),
  },
  run: (input, { db }) => db.search(String(input.query)),
}

const getLocation: AgentTool<TurnState> = {
  def: {
    name: 'get_location',
    description: 'Everything stored in a place and its sub-places. Accepts a location id, a path like "Garage › Metal shelving", or a name.',
    parameters: object({ location: text }),
  },
  run: (input, { db }) => {
    const location = db.locations.resolve(String(input.location))
    if (!location) throw new Error(`no location matching "${input.location}"`)
    return db.locations.contents(location.id)
  },
}

const recordObservations: AgentTool<TurnState> = {
  def: {
    name: 'record_observations',
    description:
      "Attach structured observations to the current inbox entry, following the field guide in your instructions (one fact per observation, null for fields that don't apply). Call once per turn with everything the utterance establishes; calling again replaces this turn's earlier observations.",
    parameters: object({ observations: listOf(OBSERVATION_SCHEMA) }),
  },
  run: (input, turn) => {
    turn.observations = input.observations as Observation[]
    return { recorded: turn.observations.length, inbox_id: turn.entry.id }
  },
}

const resolveQuestion: AgentTool<TurnState> = {
  def: {
    name: 'resolve_question',
    description: 'Mark one of the open questions as answered (or dismissed if the person says it no longer matters).',
    parameters: object({
      question_id: text,
      status: oneOf(['answered', 'dismissed']),
      answer: { ...nullable(text), description: 'The answer in your own words.' },
    }),
  },
  run: (input, { db, entry }) => {
    const question = db.questions.get(String(input.question_id))
    if (!question || question.status !== 'open') throw new Error(`no open question ${input.question_id}`)
    const status = input.status as 'answered' | 'dismissed'
    db.questions.resolve(question.id, status, textOrNull(input.answer) ?? entry.said, entry.id)
    return { ok: true }
  },
}

const askUser: AgentTool<TurnState> = {
  def: {
    name: 'ask_user',
    description:
      'Ask the person one clarifying question. Ends your turn; the question is read aloud and their next utterance comes back to you. Record anything already certain before asking.',
    parameters: object({
      question: textWith('Short, spoken-style question.'),
      options: listOf(text, '0-4 short suggested answers.'),
    }),
  },
  endsTurn: true,
  run: (input, turn) => {
    turn.asked = turn.db.questions.ask({
      conversation: turn.entry.conversation,
      inbox_ids: [turn.entry.id],
      question: String(input.question),
      options: textList(input.options).slice(0, 4),
    })
    return { asked: turn.asked.id }
  },
}

const TOOLS = [searchHouse, getLocation, recordObservations, resolveQuestion, askUser]

// ── The turn ───────────────────────────────────────────────────────────────

export interface ConverseResult {
  reply: string
  question: Question | null
  observations: Observation[]
  steps: TraceStep[]
  messages: Msg[]
  stop: string
}

export async function converse(llm: LLMProvider, db: HouseDb, entry: InboxEntry): Promise<ConverseResult> {
  const turn: TurnState = { db, entry, observations: [], asked: null }

  const result = await runLoop({
    llm,
    system: CONVERSE_SYSTEM,
    messages: [{ role: 'user', content: describeTurn(db, entry) }],
    tools: TOOLS,
    ctx: turn,
    effort: 'low',
    maxSteps: 8,
  })

  return {
    reply: chooseReply(result.text, result.stop, turn),
    question: turn.asked,
    observations: turn.observations,
    steps: result.steps,
    messages: result.messages,
    stop: result.stop,
  }
}

/** What to say back: the question if one was asked, else the model's text, else a sensible fallback. */
function chooseReply(modelText: string, stop: string, turn: TurnState): string {
  if (turn.asked) return turn.asked.question
  if (modelText.trim()) return modelText.trim()
  if (stop === 'refusal') return "Sorry, I can't help with that one."
  if (turn.observations.length) return 'Got it.'
  return "Sorry, I didn't catch that — could you say it again?"
}

/**
 * The agent's input for this turn. Kept out of the system prompt (which never
 * changes, so providers can cache it):
 *   - the house map: places (with positions) and the items in them, so
 *     same-named things are visible without a search
 *   - questions still waiting for an answer
 *   - the last few exchanges of this conversation
 *   - the utterance itself, tagged with its inbox id
 */
function describeTurn(db: HouseDb, entry: InboxEntry): string {
  const houseMap = `<house_map>\n${db.outline(true)}\n</house_map>`

  const open = db.questions.open()
  const openQuestions = open.length
    ? `<open_questions>\n${open.map((q) => `${q.id}: ${q.question}${q.options.length ? ` (options: ${q.options.join(' / ')})` : ''}`).join('\n')}\n</open_questions>`
    : ''

  const earlier = db.inbox.recentInConversation(entry.conversation, entry.id)
  const conversationSoFar = earlier.length
    ? `<conversation_so_far>\n${earlier.map((e) => `[${e.id}] person: ${e.said}\nyou: ${e.agent_reply ?? ''}`).join('\n')}\n</conversation_so_far>`
    : ''

  return [houseMap, openQuestions, conversationSoFar, `<now>${entry.at}</now>`, `[${entry.id}] person: ${entry.said}`]
    .filter(Boolean)
    .join('\n\n')
}
