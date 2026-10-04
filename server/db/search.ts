const STOPWORDS = new Set([
  'the', 'a', 'an', 'my', 'our', 'your', 'is', 'are', 'of', 'to', 'for',
  'in', 'on', 'at', 'where', 'wheres', 'find', 'locate', 'did', 'i', 'put',
  'do', 'you', 'know', 'have', 'has', 'me', 'we', 'it', 'thing', 'that',
  'some', 'by', 'into', 'onto', 'inside',
])

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Crude singularization so "remotes"/"remote" and "keys"/"key" match.
function singularize(w: string): string {
  if (w.length > 3 && w.endsWith('es')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1)
  return w
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map(singularize)
}

// Score how well a query matches a candidate's name (and aliases). 0 = none.
function scoreTokens(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0 || targetTokens.length === 0) return 0
  let hits = 0
  for (const q of queryTokens) {
    if (targetTokens.some((n) => n === q || n.includes(q) || q.includes(n))) hits++
  }
  if (hits === 0) return 0
  const queryCoverage = hits / queryTokens.length
  const nameCoverage = hits / targetTokens.length
  return queryCoverage * 0.7 + nameCoverage * 0.3
}

export interface Named {
  id: string
  name: string
  aliases?: string[]
}

export interface Match<T> {
  item: T
  score: number
}

// Rank candidates by how well their name/aliases match the query.
export function rank<T extends Named>(query: string, candidates: T[]): Match<T>[] {
  const qt = tokens(query)
  return candidates
    .map((c) => {
      const names = [c.name, ...(c.aliases ?? [])]
      const score = Math.max(...names.map((n) => scoreTokens(qt, tokens(n))))
      return { item: c, score }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
}
