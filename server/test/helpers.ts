import { DatabaseSync } from 'node:sqlite'
import { HouseDb } from '../db/house'
import type { ChatRequest, ChatResponse, LLMProvider, ToolCall } from '../llm/types'

// Minimal stand-in for a Durable Object's SqlStorage on top of node:sqlite.
export function memoryDb(): { db: HouseDb; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:')
  const sql = {
    exec(query: string, ...args: unknown[]) {
      const rows = raw.prepare(query).all(...(args as never[]))
      return { toArray: () => rows.map((r) => ({ ...r })) }
    },
  } as unknown as SqlStorage
  let depth = 0
  const tx = <T>(fn: () => T): T => {
    const name = `sp${depth++}`
    raw.exec(`SAVEPOINT ${name}`)
    try {
      const out = fn()
      raw.exec(`RELEASE ${name}`)
      return out
    } catch (e) {
      raw.exec(`ROLLBACK TO ${name}`)
      raw.exec(`RELEASE ${name}`)
      throw e
    } finally {
      depth--
    }
  }
  const db = new HouseDb(sql, tx)
  db.migrate()
  return { db, raw }
}

// A scripted model: each call returns the next planned response, and records
// the requests it saw so tests can assert on what the agent sent.
export class ScriptedLLM implements LLMProvider {
  readonly provider = 'scripted'
  readonly model = 'scripted-1'
  requests: ChatRequest[] = []
  private n = 0
  constructor(private script: ((req: ChatRequest) => { text?: string; calls?: Omit<ToolCall, 'id'>[] })[]) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.requests.push(structuredClone(req))
    const step = this.script[this.n++]
    if (!step) throw new Error('script exhausted')
    const { text = '', calls = [] } = step(req)
    const toolCalls = calls.map((c, i) => ({ ...c, id: `call_${this.n}_${i}` }))
    return {
      text,
      toolCalls,
      stop: toolCalls.length ? 'tool_use' : 'end',
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      model: this.model,
      native: { provider: this.provider, data: null },
    }
  }
}

export const obs = (o: Record<string, unknown>) => ({
  kind: 'place', item: null, quantity: null, location: null, from_location: null, details: null, relation: null,
  related_item: null, person: null, corrects_inbox_id: null, answers_question_id: null, note: null, confidence: 'high',
  ...o,
})
