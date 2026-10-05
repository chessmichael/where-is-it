import type { HouseDb, InboxEntry } from '../db/house'
import type { LLMProvider } from '../llm/types'
import { compact, type CompactResult } from './compact'
import { converse, type ConverseResult } from './converse'
import { needsStrongModel } from './route'

// The two things the app does with a person's words, as plain functions so
// the live app (house-do.ts) and the eval (evals/capture) run the exact same
// code:
//   hearUtterance — save what was said, then let the conversation agent read it
//   tidyUp        — fold pending inbox entries into the house tables

export const TIDY_BATCH = 40
const MAX_BATCHES_PER_RUN = 5

export interface Heard {
  entry: InboxEntry
  result: ConverseResult | null // null when the agent failed
  error: string | null
  ms: number
  model: string // which model heard it (see route.ts)
}

/**
 * Capture first (the words are saved before any model call), then interpret.
 * With a `fast` model, short plain turns go to it and the rest to `llm`.
 */
export async function hearUtterance(llm: LLMProvider, db: HouseDb, conversationId: string, text: string, fast?: LLMProvider | null): Promise<Heard> {
  if (fast && !needsStrongModel(text, db, conversationId)) llm = fast
  const entry = db.inbox.add(conversationId, text)
  const started = Date.now()
  try {
    const result = await converse(llm, db, entry)
    const status = result.question ? 'needs_clarification' : result.observations.length ? 'pending_compaction' : 'nothing_to_store'
    db.inbox.update(entry.id, { observations: result.observations, agent_reply: result.reply, status })
    return { entry, result, error: null, ms: Date.now() - started, model: llm.model }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    // Keep the raw words; tidy-up can still interpret `said` later.
    db.inbox.update(entry.id, { status: 'error', note: error.slice(0, 500) })
    return { entry, result: null, error, ms: Date.now() - started, model: llm.model }
  }
}

/** Inbox entries ready for tidy-up, oldest first. Failed ones are included: tidy-up reads their raw text. */
export function fileableEntries(db: HouseDb): InboxEntry[] {
  return [...db.inbox.list('pending_compaction'), ...db.inbox.list('error')].sort((a, b) => a.id.localeCompare(b.id))
}

export interface TidyRun {
  entries: InboxEntry[]
  result: CompactResult
  startedAt: string
  ms: number
}

/** Tidy up in batches until nothing is left, a batch makes no progress, or the per-run budget is spent. */
export async function tidyUp(llm: LLMProvider, db: HouseDb, onRun?: (run: TidyRun) => void): Promise<TidyRun[]> {
  const runs: TidyRun[] = []
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const entries = fileableEntries(db).slice(0, TIDY_BATCH)
    if (entries.length === 0) break
    const started = Date.now()
    const result = await compact(llm, db, entries)
    const run = { entries, result, startedAt: new Date(started).toISOString(), ms: Date.now() - started }
    runs.push(run)
    onRun?.(run)
    if (result.compacted.length === 0) break // no progress; don't spin
  }
  db.sql.setMeta('last_compacted_at', new Date().toISOString())
  return runs
}
