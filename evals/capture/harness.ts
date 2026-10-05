// Runs one capture-eval case through the real app code and grades the result.
//
// For each case: a throwaway house database (same schema and code as
// production, on node:sqlite) → optional seed → the case's turns through the
// real conversation agent (hearUtterance) and tidy-up agent (tidyUp) → checks
// on the database rows and the spoken replies. Nothing touches a real account.
//
// Bundled with esbuild and called from run-eval.mjs (see `npm run eval:capture`).

import { createProvider } from '../../server/llm'
import type { ChatRequest, ChatResponse, LLMProvider, Usage } from '../../server/llm/types'
import { hearUtterance, tidyUp, type Heard } from '../../server/agent/pipeline'
import { CONVERSE_SYSTEM } from '../../server/agent/prompts'
import type { Observation } from '../../server/agent/observations'
import type { TraceStep } from '../../server/agent/loop'
import { houseMarkdown, sqlDump } from '../../server/db/export'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HouseDb, Item, Location } from '../../server/db/house'
import { memoryDb } from '../../server/test/helpers'

// ── Case shapes (see build_cases.py) ───────────────────────────────────────

interface ExpectedItem {
  name: string
  path?: string[]
  quantity?: number
  status?: string
  lent_to?: string
  details?: Record<string, string>
}
interface SeedHouse {
  locations: string[][]
  aliases: Record<string, string[]>
  positions?: Record<string, string> // "Basement/Closet/Box of books": "top of the stack"
  items: { name: string; path: string[] | null; quantity?: number; status?: string; lent_to?: string; details?: Record<string, string> }[]
}
export interface Case {
  id: string
  set: 'empty' | 'existing' | 'shelving' | 'stack' | 'pantry' | 'lookup' | 'journey' | 'groups' | 'duplicates' | 'positional' | 'spatial'
  mode?: 'lookup' | 'change'
  tags: string[]
  said?: string
  seed?: string | null
  seed_inline?: SeedHouse
  setup?: string[]
  update?: string
  steps?: string[]
  question?: string
  ask?: 'must' | 'no' | 'either'
  knows?: string | null
  expect: Record<string, any>
}
export interface CaseFile {
  seed_houses: Record<string, SeedHouse>
  cases: Case[]
}

export interface Turn {
  role: 'system' | 'user' | 'assistant' | 'tool_call' | 'tool_result'
  content: string
  name?: string
}

export interface CaseRun {
  output: string
  transcript: Turn[]
  model: string
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number }
  stop_reason: string
  judge_model?: string
  judge_usage?: { input_tokens: number; output_tokens: number }
  grade: Record<string, number | null>
  explanation: Record<string, string>
  agent_calls: number
  questions_asked: number
}

const TIDY = '<tidy>'
const MAX_FOLLOW_UPS = 3 // questions the agent may ask about one utterance before we stop answering

// ── Running a case ─────────────────────────────────────────────────────────

export async function runCase(c: Case, file: CaseFile, opts: { model: string; personModel: string; env: Record<string, string | undefined> }): Promise<CaseRun> {
  const agent = new Metered(createProvider({ ...opts.env, LLM_PROVIDER: 'openai', LLM_MODEL: opts.model }))
  const person = new Metered(createProvider({ ...opts.env, LLM_PROVIDER: 'openai', LLM_MODEL: opts.personModel }))
  const { db } = memoryDb()
  const session = new Session(c, db, agent, person)

  const seed = c.seed ? file.seed_houses[c.seed] : c.seed_inline
  if (seed) seedHouse(db, seed)
  session.note(`Starting house:\n${houseMarkdown(db).split('\n').slice(3).join('\n').trim() || '(empty)'}`)
  const locationsAtStart = db.locations.all().length

  let checks: Checks
  switch (c.set) {
    case 'empty':
    case 'existing':
    case 'pantry': {
      const asked = await session.say(c.said!)
      const tidyAsked = await session.tidy()
      checks = gradeItems(db, c.expect, session.observations, locationsAtStart)
      checks.ask(c.ask ?? 'either', asked || tidyAsked)
      break
    }
    case 'groups': {
      for (const line of c.setup ?? []) await session.say(line)
      if (c.setup?.length) await session.tidy()
      const locationsBefore = db.locations.all().length
      session.observations = []
      const asked = await session.say(c.said!)
      const tidyAsked = await session.tidy()
      checks = gradeItems(db, c.expect, session.observations, locationsBefore)
      checks.ask(c.ask!, asked || tidyAsked)
      break
    }
    case 'shelving':
    case 'stack': {
      for (const line of c.setup ?? []) await session.say(line)
      await session.tidy()
      const boxesBefore = itemHomes(db)
      const askedInConversation = await session.say(c.update!)
      const askedByTidyUp = await session.tidy()
      const asked = askedInConversation || askedByTidyUp
      checks = c.set === 'shelving' ? gradeShelving(db, c.expect) : gradeStack(db, c.expect, boxesBefore)
      checks.ask(c.ask!, asked)
      break
    }
    case 'duplicates':
    case 'positional': {
      const asked = await session.say(c.said!)
      if (c.mode === 'lookup') {
        checks = gradeDuplicateLookup(session.lastReply, c.expect, asked)
      } else {
        const tidyAsked = await session.tidy()
        checks = gradeItems(db, c.expect, session.observations, locationsAtStart)
        checks.ask(c.ask!, asked || tidyAsked)
      }
      break
    }
    case 'lookup':
    case 'journey':
    case 'spatial': {
      for (const step of c.steps ?? []) step === TIDY ? await session.tidy() : await session.say(step)
      await session.say(c.question!)
      checks = gradeReply(session.lastReply, c.expect)
      break
    }
  }

  session.note(`House after the case:\n${houseMarkdown(db).split('\n').slice(3).join('\n').trim() || '(empty)'}`)
  // Keep the final database so it can be inspected later (npm run inspect -- --eval <variant> <id>).
  if (opts.env.EVAL_DB_DIR) {
    mkdirSync(opts.env.EVAL_DB_DIR, { recursive: true })
    writeFileSync(join(opts.env.EVAL_DB_DIR, `${c.id}.sql`), sqlDump(db))
  }
  const usage = agent.usage
  return {
    output: session.lastReply,
    transcript: session.transcript,
    model: agent.servedModel ?? opts.model,
    usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cache_read_input_tokens: usage.cachedInputTokens },
    stop_reason: 'end_turn',
    ...(person.calls ? { judge_model: person.servedModel, judge_usage: { input_tokens: person.usage.inputTokens, output_tokens: person.usage.outputTokens } } : {}),
    ...checks.result(),
    agent_calls: agent.calls,
    questions_asked: session.questionsAsked,
  }
}

/** Counts calls and tokens, and remembers which model actually answered. */
class Metered implements LLMProvider {
  usage: Usage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 }
  calls = 0
  servedModel: string | null = null
  constructor(private inner: LLMProvider) {}
  get provider() {
    return this.inner.provider
  }
  get model() {
    return this.inner.model
  }
  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.inner.chat(req)
    this.calls++
    this.servedModel = res.model
    this.usage.inputTokens += res.usage.inputTokens
    this.usage.outputTokens += res.usage.outputTokens
    this.usage.cachedInputTokens += res.usage.cachedInputTokens
    return res
  }
}

/** One simulated conversation: says things, answers the agent's questions, tidies up, records a transcript. */
class Session {
  transcript: Turn[] = [{ role: 'system', content: CONVERSE_SYSTEM, name: 'conversation agent' }]
  observations: Observation[] = []
  lastReply = ''
  questionsAsked = 0
  private conversationId = 'eval'

  constructor(
    private c: Case,
    private db: HouseDb,
    private agent: LLMProvider,
    private person: LLMProvider,
  ) {}

  note(text: string) {
    this.transcript.push({ role: 'tool_result', name: 'eval', content: text })
  }

  /** Say something; if the agent asks questions back, the simulated person answers. Returns whether it asked. */
  async say(text: string): Promise<boolean> {
    let asked = false
    let heard = await this.hear(text, 'person')
    for (let i = 0; heard.result?.question && i < MAX_FOLLOW_UPS; i++) {
      asked = true
      this.questionsAsked++
      const answer = await this.answer(heard.result.question.question, heard.result.question.options)
      heard = await this.hear(answer, 'person (simulated answer)')
    }
    return asked
  }

  /**
   * Run tidy-up. If it raises questions (in the app they appear on the House
   * screen), the simulated person answers them by talking, and tidy-up runs
   * again — up to MAX_FOLLOW_UPS rounds. Returns whether tidy-up asked anything.
   */
  async tidy(): Promise<boolean> {
    let asked = false
    const answered = new Set<string>()
    for (let round = 0; round <= MAX_FOLLOW_UPS; round++) {
      this.transcript.push({ role: 'user', name: 'eval', content: round === 0 ? '🧹 tidy-up runs now (as if time passed)' : '🧹 tidy-up runs again' })
      const runs = await tidyUp(this.agent, this.db)
      for (const run of runs) {
        this.addSteps(run.result.steps, 'tidy-up agent')
        this.transcript.push({ role: 'assistant', name: 'tidy-up agent', content: `Summary: ${run.result.summary}` })
      }
      if (!runs.length) this.note('(nothing waiting to be tidied)')

      const fromTidyUp = this.db.questions.open().filter((q) => q.conversation === null && !answered.has(q.id))
      if (!fromTidyUp.length) break
      asked = true
      for (const q of fromTidyUp) {
        answered.add(q.id)
        this.questionsAsked++
        this.note(`The House screen shows a question from tidy-up: “${q.question}”${q.options.length ? ` (${q.options.join(' / ')})` : ''}`)
        await this.say(await this.answer(q.question, q.options))
      }
    }
    return asked
  }

  private async hear(text: string, who: string): Promise<Heard> {
    this.transcript.push({ role: 'user', name: who, content: text })
    const heard = await hearUtterance(this.agent, this.db, this.conversationId, text)
    if (!heard.result) throw Object.assign(new Error(`agent failed: ${heard.error}`), { failure_class: 'harness_or_serving_error' })
    this.addSteps(heard.result.steps, 'conversation agent')
    this.observations.push(...heard.result.observations)
    this.lastReply = heard.result.reply
    this.transcript.push({ role: 'assistant', name: 'conversation agent (spoken reply)', content: heard.result.reply })
    return heard
  }

  private addSteps(steps: TraceStep[], who: string) {
    for (const step of steps) {
      if (step.text) this.transcript.push({ role: 'assistant', name: who, content: step.text })
      for (const call of step.tool_calls) {
        this.transcript.push({ role: 'tool_call', name: `${who}: ${call.name}`, content: JSON.stringify(call.input, null, 2) })
        const result = step.tool_results.find((r) => r.id === call.id)
        if (result) this.transcript.push({ role: 'tool_result', name: call.name, content: result.error ? `ERROR: ${result.error}` : JSON.stringify(result.output, null, 2) })
      }
    }
  }

  /** The simulated person answers using only what the case says they know. */
  private async answer(question: string, options: string[]): Promise<string> {
    const knows = this.c.knows?.trim() || "Nothing specific — you don't remember more than you already said."
    const res = await this.person.chat({
      system:
        'You are role-playing a person talking to a home-inventory voice app. The app just asked you a question. ' +
        'Answer briefly and naturally, the way someone would say it out loud, using ONLY the facts below. ' +
        'Like a real person, volunteer the relevant facts you know in the same breath: if you agree to list what is in something, list the items; ' +
        'if you say it is a different shelf, unit or box, also say which one or where it is. ' +
        'If the facts don\'t answer the question, say something like "not sure, you decide". ' +
        'If asked whether to list the items in a group individually and the facts don\'t say, answer "no, not this time".\n\n' +
        `Facts you know:\n${knows}`,
      messages: [{ role: 'user', content: `The app asks: "${question}"${options.length ? ` (it suggests: ${options.join(' / ')})` : ''}` }],
      tools: [],
      effort: 'low',
    })
    return res.text.trim() || 'not sure, you decide'
  }
}

// ── Seeding ────────────────────────────────────────────────────────────────

export function seedHouse(db: HouseDb, seed: SeedHouse) {
  for (const path of seed.locations) db.locations.ensurePath(path.map((name, depth) => ({ name, kind: depth === 0 ? 'room' : kindFor(name) })))
  for (const [pathText, position] of Object.entries(seed.positions ?? {})) {
    db.locations.update(db.locations.ensurePath(pathText.split('/').map((name) => ({ name }))), { position })
  }
  for (const [pathText, aliases] of Object.entries(seed.aliases)) {
    db.locations.update(db.locations.ensurePath(pathText.split('/').map((name) => ({ name }))), { aliases })
  }
  for (const it of seed.items) {
    db.items.save(null, {
      name: it.name,
      location_id: it.path?.length ? db.locations.ensurePath(it.path.map((name) => ({ name }))) : null,
      quantity: it.quantity ?? null,
      status: it.status ?? null,
      lent_to: it.lent_to ?? null,
      details: it.details ? Object.entries(it.details).map(([key, value]) => ({ key, value })) : null,
    })
  }
}

function kindFor(name: string): string {
  const n = name.toLowerCase()
  if (/shelf$/.test(n)) return 'shelf'
  if (/drawer|cabinet|closet|pantry|safe/.test(n)) return 'storage'
  if (/bin|box|tub|tote|basket|bag|canister|folder|envelope|can$/.test(n)) return 'container'
  if (/hook|pegboard|rack/.test(n)) return 'fixture'
  return 'furniture'
}

// ── Matching names and paths ───────────────────────────────────────────────

const FILLER = new Set(['the', 'a', 'an', 'my', 'our', 'your', 'of', 'under', 'behind', 'above', 'over', 'on', 'in', 'at', 'by', 'next', 'to', 'some'])

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !FILLER.has(t))
    .map((t) => (t.length > 3 && t.endsWith('es') && !t.endsWith('ses') ? t.slice(0, -2) : t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
}

/** Loose match: same words after normalizing, or one's words contain the other's. */
function sameName(expected: string, actual: string): boolean {
  return expected.split('|').some((alt) => {
    const a = tokens(alt)
    const b = tokens(actual)
    if (!a.length || !b.length) return false
    const inB = a.every((t) => b.includes(t))
    const inA = b.every((t) => a.includes(t))
    return inB || inA
  })
}

/**
 * Does an actual location path satisfy an expected one?
 *  - every required level appears, in order (optional "x?" levels may be skipped)
 *  - the innermost place matches the expected innermost required place
 *  - at most one extra level beyond what was expected
 */
function pathMatches(expected: string[], actual: string[]): boolean {
  const required = expected.filter((seg) => !seg.endsWith('?'))
  const optionalCount = expected.length - required.length
  if (!actual.length || !required.length) return false

  let next = 0 // index into `required` we're looking for
  for (const seg of actual) if (next < required.length && sameName(required[next], seg)) next++
  const allInOrder = next === required.length
  const leaf = actual[actual.length - 1]
  const lastExpected = expected[expected.length - 1]
  // The innermost place must be the last required level — or an optional level after it ("Attic › Red tote?").
  const leafMatches = sameName(required[required.length - 1], leaf) || (lastExpected.endsWith('?') && sameName(lastExpected.slice(0, -1), leaf))
  const extraLevels = actual.length - required.length
  return allInOrder && leafMatches && extraLevels <= 1 + optionalCount
}

/** A free-text location ("in the trunk of my car") matches if it mentions every required level. */
function noteMatches(expected: string[], note: string): boolean {
  return expected.filter((seg) => !seg.endsWith('?')).every((seg) => seg.split('|').some((alt) => tokens(alt).every((t) => tokens(note).includes(t))))
}

function itemPath(db: HouseDb, item: Item): string[] {
  const path = db.locations.path(item.location_id)
  if (path) return path.split(' › ')
  return item.location_note ? [item.location_note] : []
}

/**
 * Items matching an expected name, best first: exact name before a looser match
 * ("Old photos" before "Box of old photos"), and plain items before items that
 * are also places (the box itself).
 */
function findItem(db: HouseDb, name: string): Item[] {
  const exact = (it: Item) => name.split('|').some((alt) => tokens(alt).join(' ') === tokens(it.name).join(' '))
  return db.items
    .all()
    .filter((it) => sameName(name, it.name) || db.items.aliases(it.id).some((a) => sameName(name, a)))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)) || Number(a.place_id !== null) - Number(b.place_id !== null))
}

// ── Grading ────────────────────────────────────────────────────────────────

class Checks {
  private grade: Record<string, number | null> = { pass: null, database: null, observations: null, asking: null, reply: null }
  private why: Record<string, string> = {}
  private failures: string[] = []
  private askHardFail = false

  set(metric: string, ok: boolean | null, detail: string) {
    this.grade[metric] = ok === null ? null : ok ? 1 : 0
    this.why[metric] = detail
  }
  fail(reason: string) {
    this.failures.push(reason)
  }
  ask(expected: 'must' | 'no' | 'either', asked: boolean) {
    if (expected === 'either') return this.set('asking', true, asked ? 'asked (either was fine)' : "didn't ask (either was fine)")
    const ok = expected === 'must' ? asked : !asked
    this.set('asking', ok, expected === 'must' ? (asked ? 'asked, as required' : 'should have asked a clarifying question but guessed') : asked ? 'asked when it had enough information (soft miss)' : "didn't need to ask, and didn't")
    if (expected === 'must' && !asked) this.askHardFail = true
  }
  result() {
    const primary = this.grade.database ?? this.grade.reply
    const pass = primary === 1 && !this.askHardFail
    this.grade.pass = pass ? 1 : 0
    this.why.pass = pass ? 'all checks passed' : [...this.failures, this.askHardFail ? 'should have asked first' : ''].filter(Boolean).join('; ')
    return { grade: this.grade, explanation: this.why }
  }
}

/** Sets A, B, E, H: are the expected items in the database, at the expected places? */
export function gradeItems(db: HouseDb, expect: Record<string, any>, observations: Observation[], locationsBefore: number): Checks {
  const checks = new Checks()
  const problems: string[] = []
  for (const want of expect.items as ExpectedItem[]) {
    const candidates = findItem(db, want.name)
    if (!candidates.length) {
      problems.push(`no item named "${want.name.replace(/\|/g, ' / ')}" (items: ${db.items.all().map((i) => i.name).join(', ') || 'none'})`)
      continue
    }
    const match = candidates.find((it) => itemSatisfies(db, it, want).length === 0)
    if (!match) problems.push(`"${candidates[0].name}": ${itemSatisfies(db, candidates[0], want).join(', ')}`)
  }
  for (const [name, count] of Object.entries((expect.item_counts ?? {}) as Record<string, number>)) {
    const found = db.items.all().filter((it) => it.status !== 'gone' && sameName(name, it.name)).length
    if (found !== count) problems.push(`${found} item(s) named "${name}", expected ${count}`)
  }
  if (typeof expect.new_locations === 'number') {
    const added = db.locations.all().length - locationsBefore
    if (added > expect.new_locations) problems.push(`created ${added} new place(s), expected at most ${expect.new_locations}`)
  }
  for (const p of problems) checks.fail(p)
  checks.set('database', problems.length === 0, problems.length ? problems.join('; ') : 'every expected item is in the right place')

  // Secondary: did the conversation agent's observations alone already say the right thing?
  const missed = (expect.items as ExpectedItem[]).filter(
    (want) =>
      !observations.some(
        (o) => o.item && sameName(want.name, o.item) && (!want.path || (o.location && pathMatches(want.path, o.location))) && (!want.status || o.kind === 'lend'),
      ),
  )
  checks.set('observations', missed.length === 0, missed.length ? `observations missed: ${missed.map((m) => m.name.split('|')[0]).join(', ')}` : 'observations named every item and place')
  return checks
}

function itemSatisfies(db: HouseDb, it: Item, want: ExpectedItem): string[] {
  const issues: string[] = []
  const path = itemPath(db, it)
  const noteOk = !it.location_id && it.location_note && want.path && noteMatches(want.path, it.location_note)
  if (want.path && !noteOk && !pathMatches(want.path, path)) issues.push(`filed at "${path.join(' › ') || 'nowhere'}", expected "${want.path.join(' › ').replace(/\|/g, ' / ')}"`)
  if (want.quantity != null && it.quantity !== want.quantity) issues.push(`quantity ${it.quantity ?? 'none'}, expected ${want.quantity}`)
  if (want.status && it.status !== want.status) issues.push(`status ${it.status}, expected ${want.status}`)
  if (want.lent_to && !(it.lent_to ?? it.location_note ?? '').toLowerCase().includes(want.lent_to.toLowerCase())) issues.push(`lent to "${it.lent_to ?? ''}", expected ${want.lent_to}`)
  for (const [key, value] of Object.entries(want.details ?? {})) {
    const known = [it.name, it.description ?? '', ...db.items.details(it.id).map((d) => `${d.key} ${d.value}`)].join(' ').toLowerCase()
    if (!known.includes(value.toLowerCase())) issues.push(`missing ${key} "${value}"`)
  }
  return issues
}

/**
 * Text that could carry a place's position marker. The position field comes
 * first (it's the authoritative one); name, aliases and description are also
 * read, so agents without a position field can still be graded.
 */
function markerText(db: HouseDb, loc: Location): string {
  return [loc.position ?? '', loc.name, loc.description ?? '', ...db.locations.aliases(loc.id)].join(' | ').toLowerCase()
}

function ancestors(db: HouseDb, id: string | null): Location[] {
  const chain: Location[] = []
  for (let loc = id ? db.locations.get(id) : null; loc; loc = loc.parent_id ? db.locations.get(loc.parent_id) : null) chain.unshift(loc)
  return chain
}

/** The shelving unit an item sits on: the level just below the room. */
function unitOf(db: HouseDb, item: Item): Location | null {
  return ancestors(db, item.location_id)[1] ?? null
}

/** Set C: is each unit marked with the right position, and are items on the same / different units as expected? */
export function gradeShelving(db: HouseDb, expect: Record<string, any>): Checks {
  const checks = new Checks()
  const problems: string[] = []
  const unitFor = (name: string) => {
    const it = findItem(db, name)[0]
    if (!it) problems.push(`no item "${name}"`)
    return it ? unitOf(db, it) : null
  }
  for (const u of expect.units ?? []) {
    const unit = unitFor(u.holding)
    if (!unit) continue
    const words = (u.position as string).split('|')
    const chain = ancestors(db, findItem(db, u.holding)[0]?.location_id ?? null).slice(1)
    if (!chain.some((loc) => words.some((w) => markerText(db, loc).includes(w.toLowerCase())))) {
      problems.push(`the unit holding ${u.holding} ("${unit.name}") isn't marked "${words.join(' / ')}"`)
    }
  }
  for (const [a, b] of expect.same_unit ?? []) {
    const ua = unitFor(a)
    const ub = unitFor(b)
    if (ua && ub && ua.id !== ub.id) problems.push(`${a} and ${b} should share a unit but are on "${ua.name}" and "${ub.name}"`)
  }
  for (const [a, b] of expect.different_unit ?? []) {
    const ua = unitFor(a)
    const ub = unitFor(b)
    if (ua && ub && ua.id === ub.id) problems.push(`${a} and ${b} should be on different units but are both on "${ua.name}"`)
  }
  for (const p of problems) checks.fail(p)
  checks.set('database', problems.length === 0, problems.length ? problems.join('; ') : 'units marked and assigned correctly')
  return checks
}

/** Where each item lives (by location id), to check items keep their box when the stack is reordered. */
export function itemHomes(db: HouseDb): Map<string, string | null> {
  return new Map(db.items.all().map((it) => [it.id, it.location_id]))
}

/**
 * A box's place in its stack (1 = top), read from its name, aliases or
 * description. If those still say "top box" after it moved to the bottom, it
 * reads as the top — a stale marker is a real problem for a person reading it.
 */
function stackRank(db: HouseDb, box: Location, size: number): number | null {
  // The position field is authoritative when set; otherwise fall back to name, aliases and description.
  const text = box.position ? box.position.toLowerCase() : markerText(db, box)
  const ordinal = '(\\d+|first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)'
  const toNumber = (w: string) => ({ first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 } as Record<string, number>)[w] ?? Number.parseInt(w, 10)
  const fromTop = text.match(new RegExp(`\\b${ordinal}\\s+(?:from|to)\\s+(?:the\\s+)?top\\b`))
  if (fromTop) return toNumber(fromTop[1])
  const fromBottom = text.match(new RegExp(`\\b${ordinal}\\s+(?:from|to)\\s+(?:the\\s+)?bottom\\b`))
  if (fromBottom) return size + 1 - toNumber(fromBottom[1])
  const rules: [RegExp, number][] = [
    [/\btop\b/, 1],
    [/\b(bottom|last)\b/, size],
    [/\bmiddle\b/, size === 3 ? 2 : NaN],
    [/\b(second|2nd)\b/, 2],
    [/\b(third|3rd)\b/, 3],
    [/\b(fourth|4th)\b/, 4],
  ]
  for (const [pattern, rank] of rules) if (pattern.test(text) && Number.isFinite(rank)) return rank
  return null
}

/** Set D: is the stack in the expected order, and did every item stay in its own box? */
export function gradeStack(db: HouseDb, expect: Record<string, any>, homesBefore: Map<string, string | null>): Checks {
  const checks = new Checks()
  const problems: string[] = []
  const order: string[] = expect.stack
  order.forEach((name, i) => {
    const it = findItem(db, name)[0]
    if (!it) return problems.push(`no item "${name}"`)
    const box = it.location_id ? db.locations.get(it.location_id) : null
    if (!box) return problems.push(`${name} isn't in a box`)
    const rank = stackRank(db, box, order.length)
    if (rank !== i + 1) problems.push(`${name}'s box ("${box.name}") reads as position ${rank ?? 'unmarked'}, expected ${i + 1} from the top`)
    if (expect.items_keep_their_box && homesBefore.has(it.id) && homesBefore.get(it.id) !== it.location_id) {
      problems.push(`${name} moved into a different box ("${box.name}") instead of its box moving`)
    }
  })
  for (const p of problems) checks.fail(p)
  checks.set('database', problems.length === 0, problems.length ? problems.join('; ') : 'stack order correct and contents stayed in their boxes')
  return checks
}

/** Sets F, G: does the spoken reply give the right place (and not a stale one)? */
export function gradeReply(reply: string, expect: Record<string, any>): Checks {
  const checks = new Checks()
  const text = reply.toLowerCase().replace(/[‘’]/g, "'").replace(/[-‐]/g, ' ')
  const has = (alt: string) => text.includes(alt.toLowerCase().replace(/-/g, ' '))
  const missing = (expect.answer_mentions as string[]).filter((g) => !g.split('|').some(has))
  const stale = ((expect.answer_not_mentions as string[]) ?? []).filter((g) => g.split('|').some(has))
  const problems = [
    ...missing.map((g) => `reply doesn't mention "${g.replace(/\|/g, ' / ')}"`),
    ...stale.map((g) => `reply mentions stale "${g.replace(/\|/g, ' / ')}"`),
  ]
  for (const p of problems) checks.fail(p)
  checks.set('reply', problems.length === 0, problems.length ? problems.join('; ') : 'reply gave the right place')
  return checks
}

/**
 * Set I lookups: "where's the red tote?" with two red totes. Credit for naming
 * both places, or for asking which one and then naming the right place.
 */
export function gradeDuplicateLookup(reply: string, expect: Record<string, any>, asked: boolean): Checks {
  const mentions = asked ? expect.after_answer_mentions : (expect.answer_mentions_each as string[][]).flat()
  const checks = gradeReply(reply, { answer_mentions: mentions, answer_not_mentions: [] })
  checks.set('asking', true, asked ? 'asked which one (fine)' : 'answered with both (fine)')
  return checks
}
