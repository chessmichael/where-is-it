import type { HouseDb } from './db/house'

// Conversation and compaction traces, kept in the account's own database and
// served as readable JSON files:
//   traces/<conversationId>.json        one file per conversation
//   traces/compaction-<timestamp>.json  one file per tidy-up run
// Each holds the exact model input, every model step, tool call and result,
// token usage and timing — the raw material for evals.
//
// Storage is one row per conversation turn (rows are size-limited, and
// conversations grow), stitched back into a single document on read.

export const TRACE_SCHEMA = `CREATE TABLE IF NOT EXISTS traces (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  file    TEXT NOT NULL,   -- c_2026-10-04_ab12cd.json, compaction-2026-10-04T18-31-18-430Z.json
  kind    TEXT NOT NULL,   -- conversation | compaction
  at      TEXT NOT NULL,
  header  TEXT,            -- JSON, provider/model; first row of a conversation
  body    TEXT NOT NULL    -- JSON: one turn, or the whole compaction run
)`
export const TRACE_INDEX = 'CREATE INDEX IF NOT EXISTS traces_file ON traces (file, id)'

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)

export function appendConversationTrace(db: HouseDb, conversationId: string, header: Record<string, unknown>, turn: Record<string, unknown>): void {
  db.sql.run(
    `INSERT INTO traces (file, kind, at, header, body) VALUES (?, 'conversation', ?, ?, ?)`,
    `${safe(conversationId)}.json`, new Date().toISOString(), JSON.stringify({ conversation: conversationId, ...header }), JSON.stringify(turn),
  )
}

export function writeCompactionTrace(db: HouseDb, doc: Record<string, unknown>): string {
  const file = `compaction-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  db.sql.run(`INSERT INTO traces (file, kind, at, body) VALUES (?, 'compaction', ?, ?)`, file, new Date().toISOString(), JSON.stringify(doc))
  return file
}

export function listTraces(db: HouseDb): { name: string; size: number; uploaded: string }[] {
  return db.sql
    .all<{ name: string; size: number; uploaded: string }>(
      'SELECT file AS name, SUM(LENGTH(body)) AS size, MAX(at) AS uploaded FROM traces GROUP BY file ORDER BY uploaded DESC',
    )
    .map((r) => ({ ...r }))
}

export function getTrace(db: HouseDb, name: string): string | null {
  const rows = db.sql.all<{ kind: string; at: string; header: string | null; body: string }>(
    'SELECT kind, at, header, body FROM traces WHERE file = ? ORDER BY id',
    `${safe(name.replace(/\.json$/, ''))}.json`,
  )
  if (!rows.length) return null
  if (rows[0].kind === 'compaction') return JSON.stringify(JSON.parse(rows[0].body), null, 2)
  const doc = {
    ...JSON.parse(rows[0].header ?? '{}'),
    started_at: rows[0].at,
    turns: rows.map((r) => JSON.parse(r.body)),
  }
  return JSON.stringify(doc, null, 2)
}
