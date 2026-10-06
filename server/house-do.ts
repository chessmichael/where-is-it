import { DurableObject } from 'cloudflare:workers'
import type { Account } from './auth'
import { fileableEntries, hearUtterance, tidyUp } from './agent/pipeline'
import { planRedo, REDO_NOTE } from './agent/redo'
import { HouseDb } from './db/house'
import { houseTree, renderExport, type ExportName } from './db/export'
import { inspectHouse } from './db/inspect'
import { renderInspector } from './db/inspect-html'
import { createFastProvider, createProvider } from './llm'
import { appendConversationTrace, getTrace, listTraces, writeCompactionTrace } from './trace'

// One instance per account: owns that account's SQLite database and runs its
// agents. Requests for the same account are serialized here.

const TIDY_SOON_AT = 20 // pending entries that trigger a near-immediate tidy-up
const TIDY_EVENTUALLY_MS = 6 * 3600_000 // otherwise tidy up within 6 hours

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
    const llm = createProvider(this.env)
    const heard = await hearUtterance(llm, this.db, conversationId, text, createFastProvider(this.env))
    const { entry, result, error } = heard

    appendConversationTrace(this.db, conversationId, { provider: llm.provider, model: llm.model }, {
      inbox_id: entry.id,
      at: entry.at,
      said: text,
      ms: heard.ms,
      ...(result
        ? { reply: result.reply, question: result.question, observations: result.observations, stop: result.stop, input: result.messages[0], steps: result.steps }
        : { error }),
    })
    await this.scheduleTidyUp()

    if (!result) {
      return {
        inboxId: entry.id,
        reply: "I saved what you said, but couldn't work it out just now. I'll sort it out later.",
        question: null,
        stored: 0,
        observations: [],
        error,
      }
    }
    return {
      inboxId: entry.id,
      reply: result.reply,
      question: result.question ? { id: result.question.id, text: result.question.question, options: result.question.options, diagram: result.question.diagram } : null,
      stored: result.observations.length,
      observations: result.observations,
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

  async inspectPage(title: string) {
    return renderInspector(inspectHouse(this.db), { title, subtitle: 'your house, live' })
  }

  async exportFile(name: ExportName) {
    return renderExport(this.db, name)
  }

  async compactNow(account: Account) {
    this.remember(account)
    return this.runCompaction()
  }

  /** Redo a place (or the whole house, with null) from what was said; a copy is saved first so it can be undone. */
  async redo(account: Account, locationId: string | null) {
    this.remember(account)
    await this.compacting // don't redo underneath a tidy-up in progress
    const plan = planRedo(this.db, locationId)
    const result = await this.runCompaction()
    return { snapshot: plan.snapshot, scope: plan.scope, entries: plan.entries, ...result }
  }

  async snapshots() {
    return { snapshots: this.db.snapshots.list() }
  }

  /** Put the house back as it was in a saved copy (e.g. undo a redo). */
  async restoreSnapshot(account: Account, id: string) {
    this.remember(account)
    await this.compacting
    this.db.snapshots.restore(id)
    return { ok: true, status: this.db.inbox.countByStatus() }
  }

  async alarm() {
    await this.runCompaction()
  }

  /** Tidy up soon if a lot is waiting, otherwise within a few hours. */
  private async scheduleTidyUp() {
    const pending = fileableEntries(this.db).length
    if (pending === 0) return
    const soon = Date.now() + (pending >= TIDY_SOON_AT ? 2000 : TIDY_EVENTUALLY_MS)
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
    const runs = await tidyUp(llm, this.db, ({ entries, result, startedAt, ms }) => {
      writeCompactionTrace(this.db, {
        kind: 'compaction',
        provider: llm.provider,
        model: llm.model,
        at: startedAt,
        ms,
        entries: entries.map((e) => e.id),
        compacted: result.compacted,
        questions: result.questions,
        summary: result.summary,
        stop: result.stop,
        input: result.messages[0],
        steps: result.steps,
      })
    })
    // Anything left (blocked or out of budget) gets another look later — soon, when it's a redo in progress.
    const left = fileableEntries(this.db)
    const redoing = left.some((e) => e.note?.startsWith(`${REDO_NOTE}:`)) && runs.some((r) => r.result.compacted.length > 0)
    if (left.length) await this.ctx.storage.setAlarm(Date.now() + (redoing ? 2000 : TIDY_EVENTUALLY_MS))
    return {
      runs: runs.map((r) => ({ compacted: r.result.compacted.length, questions: r.result.questions, summary: r.result.summary })),
      status: this.db.inbox.countByStatus(),
    }
  }
}
