// A thin, typed wrapper around the Durable Object's SQLite handle.
// Every other module in db/ talks to the database through this.

export type Row = Record<string, SqlStorageValue>
export type Value = SqlStorageValue

export class Sql {
  constructor(
    private handle: SqlStorage,
    private transaction: <T>(fn: () => T) => T,
  ) {}

  /** Run a statement that returns nothing interesting (INSERT, UPDATE, ...). */
  run(query: string, ...args: Value[]): void {
    this.handle.exec(query, ...args)
  }

  /** All rows of a query. */
  all<T = Row>(query: string, ...args: Value[]): T[] {
    return this.handle.exec(query, ...args).toArray() as T[]
  }

  /** The first row of a query, or null. */
  first<T = Row>(query: string, ...args: Value[]): T | null {
    return this.all<T>(query, ...args)[0] ?? null
  }

  /** Run `fn` atomically: all of its writes land, or none do. */
  tx<T>(fn: () => T): T {
    return this.transaction(fn)
  }

  // ── the meta table: small key/value settings and counters ──

  getMeta(key: string): string | null {
    return this.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', key)?.value ?? null
  }

  setMeta(key: string, value: string): void {
    this.run(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    )
  }

  /** Increment and return a named counter (1, 2, 3, ...). Used for readable ids. */
  nextNumber(counter: string): number {
    const next = Number(this.getMeta(counter) ?? '0') + 1
    this.setMeta(counter, String(next))
    return next
  }
}

export const now = () => new Date().toISOString()

/** Turn JSON text from a column back into a value, tolerating NULL. */
export function parseJson<T>(text: Value, fallback: T): T {
  return text === null || text === undefined ? fallback : (JSON.parse(String(text)) as T)
}
