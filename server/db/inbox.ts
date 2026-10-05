import { tokens } from './search'
import { now, parseJson, type Row, type Sql } from './sql'
import type { InboxEntry, InboxStatus, Question } from './types'

// Layer 1: everything the person said, verbatim, with the agent's reading of
// it — plus the clarifying questions the agent has asked.

export class Inbox {
  constructor(private sql: Sql) {}

  /** Save an utterance. Ids read like in_2026-10-04_0007 (7th entry that day). */
  add(conversation: string, said: string): InboxEntry {
    const at = now()
    const day = at.slice(0, 10)
    const number = this.sql.nextNumber(`seq:inbox:${day}`)
    const id = `in_${day}_${String(number).padStart(4, '0')}`
    this.sql.run(
      `INSERT INTO inbox (id, at, conversation, said, status)
       VALUES (?, ?, ?, ?, 'received')`,
      id, at, conversation, said,
    )
    return this.get(id)!
  }

  get(id: string): InboxEntry | null {
    const row = this.sql.first('SELECT * FROM inbox WHERE id = ?', id)
    return row ? toEntry(row) : null
  }

  /** Change the agent-written fields of an entry. What was said never changes. */
  update(id: string, changes: Partial<Pick<InboxEntry, 'observations' | 'agent_reply' | 'status' | 'note' | 'compacted_at'>>): void {
    const current = this.get(id)
    if (!current) throw new Error(`no inbox entry ${id}`)
    const next = { ...current, ...changes }
    this.sql.run(
      `UPDATE inbox
       SET observations = ?, agent_reply = ?, status = ?, note = ?, compacted_at = ?
       WHERE id = ?`,
      JSON.stringify(next.observations), next.agent_reply, next.status, next.note, next.compacted_at, id,
    )
  }

  /** Entries oldest-first, optionally only those with one status. */
  list(status?: InboxStatus): InboxEntry[] {
    const rows = status
      ? this.sql.all('SELECT * FROM inbox WHERE status = ? ORDER BY at, id', status)
      : this.sql.all('SELECT * FROM inbox ORDER BY at, id')
    return rows.map(toEntry)
  }

  /** The last few exchanges of a conversation (oldest first), excluding one entry. */
  recentInConversation(conversation: string, excludingId: string, limit = 8): InboxEntry[] {
    const newestFirst = this.sql.all(
      `SELECT * FROM inbox
       WHERE conversation = ? AND id != ?
       ORDER BY at DESC, id DESC
       LIMIT ?`,
      conversation, excludingId, limit,
    )
    return newestFirst.map(toEntry).reverse()
  }

  /** How many entries are in each status, e.g. { compacted: 12, pending_compaction: 3 }. */
  countByStatus(): Record<string, number> {
    const counts: Record<string, number> = {}
    for (const row of this.sql.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM inbox GROUP BY status')) {
      counts[row.status] = row.n
    }
    return counts
  }
}

export class Questions {
  constructor(private sql: Sql) {}

  /** Record a question. Ids read like q_0003. */
  ask(q: { conversation: string | null; inbox_ids: string[]; question: string; options: string[]; diagram?: string | null }): Question {
    const id = `q_${String(this.sql.nextNumber('seq:question')).padStart(4, '0')}`
    this.sql.run(
      `INSERT INTO questions (id, at, conversation, inbox_ids, question, options, diagram, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
      id, now(), q.conversation, JSON.stringify(q.inbox_ids), q.question, JSON.stringify(q.options), q.diagram?.trimEnd() || null,
    )
    return this.get(id)!
  }

  get(id: string): Question | null {
    const row = this.sql.first('SELECT * FROM questions WHERE id = ?', id)
    return row ? toQuestion(row) : null
  }

  open(): Question[] {
    return this.sql.all(`SELECT * FROM questions WHERE status = 'open' ORDER BY at`).map(toQuestion)
  }

  /** Recently answered questions, newest first (compaction reads these). */
  recentlyAnswered(limit = 20): Question[] {
    return this.sql.all(`SELECT * FROM questions WHERE status = 'answered' ORDER BY at DESC LIMIT ?`, limit).map(toQuestion)
  }

  all(): Question[] {
    return this.sql.all('SELECT * FROM questions ORDER BY at').map(toQuestion)
  }

  /**
   * Should an agent be allowed to ask this? People don't always answer in a
   * way that settles things, so one rephrased follow-up is fine — but never
   * the same words again, never after they said "not sure / you decide", and
   * never a third time. Returns null to allow, or the reason to refuse.
   *
   * `earlier` = questions already asked about the same thing: in this
   * conversation (by wording) or about the same inbox entries.
   */
  repeatCheck(question: string, earlier: Question[]): string | null {
    const sameThing = earlier.filter((q) => overlap(q.question, question) >= 0.5)
    if (!sameThing.length) return null
    const declined = sameThing.find((q) => q.answer && DONT_KNOW.test(q.answer))
    if (declined) return `They already said "${declined.answer}" to ${declined.id} ("${declined.question}"). Don't ask again: decide on a sensible default and tell them what you chose.`
    if (sameThing.length >= 2) return `You've already asked about this ${sameThing.length} times (${sameThing.map((q) => q.id).join(', ')}). Stop asking: record it with the most specific place you know and a sensible default, and tell them they can correct it.`
    if (sameThing.some((q) => overlap(q.question, question) >= 0.85)) return `That's the same question as ${sameThing[0].id} ("${sameThing[0].question}"). If their answer didn't settle it, ask differently: narrower, with 2-3 concrete options, and say why you need to know.`
    return null
  }

  recentInConversation(conversation: string): Question[] {
    return this.sql.all(`SELECT * FROM questions WHERE conversation = ? ORDER BY at DESC LIMIT 20`, conversation).map(toQuestion)
  }

  aboutEntries(inboxIds: string[]): Question[] {
    if (!inboxIds.length) return []
    return this.sql.all(`SELECT * FROM questions ORDER BY at DESC LIMIT 200`).map(toQuestion).filter((q) => q.inbox_ids.some((id) => inboxIds.includes(id)))
  }

  /**
   * Close a question. Inbox entries that were waiting on it become ready for
   * tidy-up again, with the answer noted so compaction can use it.
   */
  resolve(id: string, status: 'answered' | 'dismissed', answer: string | null, answeredBy: string | null): void {
    const question = this.get(id)
    this.sql.run('UPDATE questions SET status = ?, answer = ?, answered_by = ? WHERE id = ?', status, answer, answeredBy, id)
    for (const inboxId of question?.inbox_ids ?? []) {
      this.sql.run(
        `UPDATE inbox SET status = 'pending_compaction', note = ?
         WHERE id = ? AND status = 'needs_clarification'`,
        `${id} ${status}: ${answer ?? ''}`, inboxId,
      )
    }
  }
}

/** Answers that mean "I can't or won't say" — asking again would just be nagging. */
const DONT_KNOW = /\b(not sure|no idea|don'?t know|dunno|you decide|you pick|doesn'?t matter|whatever|up to you|can'?t remember|forget it|skip)\b/i

/** Share of words two questions have in common (0–1), ignoring filler. */
function overlap(a: string, b: string): number {
  const x = new Set(tokens(a))
  const y = new Set(tokens(b))
  if (!x.size || !y.size) return 0
  const shared = [...x].filter((t) => y.has(t)).length
  return shared / Math.min(x.size, y.size)
}

function toEntry(row: Row): InboxEntry {
  return { ...(row as unknown as InboxEntry), observations: parseJson(row.observations, []) }
}

function toQuestion(row: Row): Question {
  return {
    ...(row as unknown as Question),
    inbox_ids: parseJson(row.inbox_ids, []),
    options: parseJson(row.options, []),
  }
}
