// Conversation and compaction traces, stored as readable JSON files in R2:
//   users/<uid>/traces/<conversationId>.json      one file per conversation
//   users/<uid>/traces/compaction-<timestamp>.json one file per tidy-up run
// Each holds the exact model input, every model step, tool call and result,
// token usage and timing — the raw material for evals.

export function userPrefix(uid: string): string {
  return `users/${uid.replace(/[^a-zA-Z0-9:_-]/g, '_')}/`
}

export async function appendConversationTrace(
  bucket: R2Bucket,
  uid: string,
  conversationId: string,
  header: Record<string, unknown>,
  turn: Record<string, unknown>,
): Promise<void> {
  const key = `${userPrefix(uid)}traces/${safe(conversationId)}.json`
  const existing = await bucket.get(key)
  const doc: { turns: unknown[] } & Record<string, unknown> = existing
    ? await existing.json()
    : { conversation: conversationId, started_at: new Date().toISOString(), ...header, turns: [] }
  doc.turns.push(turn)
  await bucket.put(key, JSON.stringify(doc, null, 2), { httpMetadata: { contentType: 'application/json' } })
}

export async function writeCompactionTrace(bucket: R2Bucket, uid: string, doc: Record<string, unknown>): Promise<string> {
  const name = `compaction-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  await bucket.put(`${userPrefix(uid)}traces/${name}`, JSON.stringify(doc, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  })
  return name
}

export async function listTraces(bucket: R2Bucket, uid: string): Promise<{ name: string; size: number; uploaded: string }[]> {
  const prefix = `${userPrefix(uid)}traces/`
  const out: { name: string; size: number; uploaded: string }[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    for (const o of page.objects) out.push({ name: o.key.slice(prefix.length), size: o.size, uploaded: o.uploaded.toISOString() })
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return out.sort((a, b) => b.uploaded.localeCompare(a.uploaded))
}

export async function getTrace(bucket: R2Bucket, uid: string, name: string): Promise<string | null> {
  const obj = await bucket.get(`${userPrefix(uid)}traces/${safe(name.replace(/\.json$/, ''))}.json`)
  return obj ? obj.text() : null
}

function safe(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
}
