import { DurableObject } from 'cloudflare:workers'
import type { Account } from './auth'
import { compact } from './agent/compact'
import { converse } from './agent/converse'
import { HouseDb } from './db/house'
import { houseTree, renderExport, type ExportName } from './db/export'
import { createProvider } from './llm'
import { appendConversationTrace, getTrace, listTraces, writeCompactionTrace } from './trace'

// One instance per account: owns that account's SQLite database and runs its
// agents. Requests for the same account are serialized here.

const COMPACT_SOON_AT = 20 // pending entries that trigger a near-immediate tidy-up
const COMPACT_EVENTUALLY_MS = 6 * 3600_000 // otherwise tidy up within 6 hours
const COMPACT_BATCH = 40

export class HouseDO extends DurableObject<Env> {
  private db: HouseDb
  private compacting: Promise<unknown> | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.db = new HouseDb(ctx.storage.sql, (fn) => ctx.storage.transactionSync(fn))
    ctx.blockConcurrencyWhile(async () => this.db.migrate())
  }

  private remember(account: Account): void {
    if (this.db.sql.getMeta('account_uid') !== account.uid) this.db.sql.setMeta('account_uid', account.uid)
    this.db.sql.setMeta('account_name', account.name)
  }

  async converse(account: Account, conversationId: string, text: string) {
    this.remember(account)
    // Capture first: the utterance is durable before any model call.
    const entry = this.db.inbox.add(conversationId, text)
    const llm = createProvider(this.env)
    const started = Date.now()
    try {
      const res = await converse(llm, this.db, entry)
      const status = res.question
        ? 'needs_clarification'
        : res.observations.length
          ? 'pending_compaction'
          : 'nothing_to_store'
      this.db.inbox.update(entry.id, { observations: res.observations, agent_reply: res.reply, status })
      appendConversationTrace(
        this.db,
        conversationId,
        { provider: llm.provider, model: llm.model },
        {
          inbox_id: entry.id,
          at: entry.at,
          said: text,
          reply: res.reply,
          question: res.question,
          observations: res.observations,
          stop: res.stop,
          ms: Date.now() - started,
          input: res.messages[0],
          steps: res.steps,
        },
      )
      await this.scheduleCompaction()
      return {
        inboxId: entry.id,
        reply: res.reply,
        question: res.question ? { id: res.question.id, text: res.question.question, options: res.question.options } : null,
        stored: res.observations.length,
        observations: res.observations,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // Keep the raw utterance; compaction can still interpret `said` later.
      this.db.inbox.update(entry.id, { status: 'error', note: message.slice(0, 500) })
      appendConversationTrace(this.db, conversationId, { provider: llm.provider, model: llm.model }, {
        inbox_id: entry.id, at: entry.at, said: text, error: message, ms: Date.now() - started,
      })
      await this.scheduleCompaction()
      return {
        inboxId: entry.id,
        reply: "I saved what you said, but couldn't work it out just now. I'll sort it out later.",
        question: null,
        stored: 0,
        observations: [],
        error: message,
      }
    }
  }

  async house() {
    return { ...houseTree(this.db), status: this.db.inbox.countByStatus(), questions: this.db.questions.open() }
  }

  async dismissQuestion(id: string) {
    this.db.questions.resolve(id, 'dismissed', null, null)
    return { ok: true }
  }

  async traceList() {
    return listTraces(this.db)
  }

  async traceFile(name: string) {
    return getTrace(this.db, name)
  }

  async exportFile(name: ExportName) {
    return renderExport(this.db, name)
  }

  async compactNow(account: Account) {
    this.remember(account)
    return this.runCompaction()
  }

  async alarm() {
    await this.runCompaction()
  }

  private fileable() {
    return [...this.db.inbox.list('pending_compaction'), ...this.db.inbox.list('error')].sort((a, b) =>
      a.id.localeCompare(b.id),
    )
  }

  private async scheduleCompaction() {
    const pending = this.fileable().length
    if (pending === 0) return
    const soon = Date.now() + (pending >= COMPACT_SOON_AT ? 2000 : COMPACT_EVENTUALLY_MS)
    const current = await this.ctx.storage.getAlarm()
    if (current === null || current > soon) await this.ctx.storage.setAlarm(soon)
  }

  private runCompaction() {
    // One run at a time per account; concurrent callers share it.
    this.compacting ??= this.compactAll().finally(() => (this.compacting = null))
    return this.compacting as ReturnType<HouseDO['compactAll']>
  }

  private async compactAll() {
    const llm = createProvider(this.env)
    const runs: { compacted: number; questions: string[]; summary: string; trace: string }[] = []
    for (let batch = 0; batch < 5; batch++) {
      const entries = this.fileable().slice(0, COMPACT_BATCH)
      if (entries.length === 0) break
      const started = Date.now()
      const res = await compact(llm, this.db, entries)
      const trace = writeCompactionTrace(this.db, {
            kind: 'compaction',
            provider: llm.provider,
            model: llm.model,
            at: new Date(started).toISOString(),
            ms: Date.now() - started,
            entries: entries.map((e) => e.id),
            compacted: res.compacted,
            questions: res.questions,
            summary: res.summary,
            stop: res.stop,
            input: res.messages[0],
            steps: res.steps,
          })
      runs.push({ compacted: res.compacted.length, questions: res.questions, summary: res.summary, trace })
      if (res.compacted.length === 0) break // no progress; don't spin
    }
    this.db.sql.setMeta('last_compacted_at', new Date().toISOString())
    // Anything left (blocked or out of budget) gets another look later.
    if (this.fileable().length) await this.ctx.storage.setAlarm(Date.now() + COMPACT_EVENTUALLY_MS)
    return { runs, status: this.db.inbox.countByStatus() }
  }
}
