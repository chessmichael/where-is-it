import { HOUSE_TABLES } from './schema'
import { now, type Sql, type Value } from './sql'

// Saved copies of the house, taken before a redo so it can be undone. A copy
// holds every house table plus the inbox and questions (a redo changes their
// statuses). Copies are kept for a week, at most MAX_KEPT of them, and live
// outside the exports (house.sql never includes them).

export const SNAPSHOT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS snapshots (
    id      TEXT PRIMARY KEY,               -- s_0003
    at      TEXT NOT NULL,
    label   TEXT NOT NULL,                  -- "Before redo of Bookcase"
    chunks  INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS snapshot_chunks (
    snapshot_id  TEXT NOT NULL,
    n            INTEGER NOT NULL,
    data         TEXT NOT NULL,             -- a slice of the JSON copy (rows are size-limited)
    PRIMARY KEY (snapshot_id, n)
  )`,
]

// Inbox first: history rows point at inbox entries, so they're restored after them (and deleted before).
const TABLES = ['inbox', 'questions', ...HOUSE_TABLES] as const
const CHUNK = 500_000 // characters per row, well under the storage row limit
const MAX_KEPT = 10
const KEEP_MS = 7 * 24 * 3600_000

export interface Snapshot {
  id: string
  at: string
  label: string
}

export class Snapshots {
  constructor(private sql: Sql) {}

  /** Save a copy of the house now; returns it. Old copies are pruned. */
  take(label: string): Snapshot {
    const copy: Record<string, unknown[]> = {}
    for (const table of TABLES) copy[table] = this.sql.all(`SELECT * FROM ${table}`)
    const json = JSON.stringify(copy)
    const id = `s_${String(this.sql.nextNumber('seq:snapshot')).padStart(4, '0')}`
    const chunks = Math.max(1, Math.ceil(json.length / CHUNK))
    this.sql.tx(() => {
      this.sql.run('INSERT INTO snapshots (id, at, label, chunks) VALUES (?, ?, ?, ?)', id, now(), label, chunks)
      for (let n = 0; n < chunks; n++) this.sql.run('INSERT INTO snapshot_chunks (snapshot_id, n, data) VALUES (?, ?, ?)', id, n, json.slice(n * CHUNK, (n + 1) * CHUNK))
    })
    this.prune()
    return this.get(id)!
  }

  get(id: string): Snapshot | null {
    return this.sql.first<Snapshot>('SELECT id, at, label FROM snapshots WHERE id = ?', id)
  }

  /** Newest first. */
  list(): Snapshot[] {
    return this.sql.all<Snapshot>('SELECT id, at, label FROM snapshots ORDER BY at DESC, id DESC')
  }

  /** Put the house back exactly as it was in that copy. The copy itself is kept. */
  restore(id: string): void {
    const row = this.sql.first<{ chunks: number }>('SELECT chunks FROM snapshots WHERE id = ?', id)
    if (!row) throw new Error(`no saved copy ${id}`)
    const parts = this.sql.all<{ data: string }>('SELECT data FROM snapshot_chunks WHERE snapshot_id = ? ORDER BY n', id)
    if (parts.length !== row.chunks) throw new Error(`saved copy ${id} is incomplete`)
    const copy = JSON.parse(parts.map((p) => p.data).join('')) as Record<string, Record<string, Value>[]>
    this.sql.tx(() => {
      for (const table of [...TABLES].reverse()) this.sql.run(`DELETE FROM ${table}`)
      for (const table of TABLES) {
        for (const r of copy[table] ?? []) {
          const cols = Object.keys(r)
          this.sql.run(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => r[c] as Value))
        }
      }
    })
  }

  private prune(): void {
    const cutoff = new Date(Date.now() - KEEP_MS).toISOString()
    const keep = new Set(this.list().slice(0, MAX_KEPT).map((s) => s.id))
    for (const s of this.list()) {
      if (keep.has(s.id) && s.at >= cutoff) continue
      this.sql.run('DELETE FROM snapshot_chunks WHERE snapshot_id = ?', s.id)
      this.sql.run('DELETE FROM snapshots WHERE id = ?', s.id)
    }
  }
}
