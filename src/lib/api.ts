import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'

// Thin client for the Worker API, plus an offline outbox: utterances made
// without a connection are queued locally and sent, in order, once back online.

export interface Account {
  uid: string
  name: string
}

export interface Me {
  account: Account | null
  devAuth: boolean
  model: { provider: string; model: string } | null
}

export interface AgentQuestion {
  id: string
  text: string
  options: string[]
  diagram?: string | null // a fixed-width sketch shown with the question
}

export interface ConverseReply {
  conversationId: string
  inboxId: string
  reply: string
  question: AgentQuestion | null
  stored: number
  observations: Captured[]
  error?: string
}

// What the agent recorded for one utterance (mirrors server/agent/observations.ts).
export interface Captured {
  kind: string
  item: string | null
  quantity: number | null
  location: string[] | null
  from_location: string[] | null
  details: { key: string; value: string }[] | null
  relation: string | null
  related_item: string | null
  person: string | null
  note: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface HouseItem {
  id: string
  name: string
  status: string
  lent_to?: string
  quantity?: number
  category?: string
  aliases?: string[]
  details?: { key: string; value: string }[]
  also_a_place?: string // set when this item is also a place (shown as the place)
}

export interface HouseNode {
  id: string
  name: string
  kind: string
  preposition: string
  position?: string
  grid?: { row: number; col: number; rows: number; cols: number } // its cell in the parent's layout
  description?: string
  aliases?: string[]
  items: HouseItem[]
  children: HouseNode[]
}

export interface OpenQuestion {
  id: string
  question: string
  options: string[]
  diagram?: string | null
  conversation: string | null
}

export interface House {
  rooms: HouseNode[]
  elsewhere: (HouseItem & { location_note?: string })[]
  relationships: { subject_item_id: string; relation: string; object_item_id: string }[]
  pending_inbox_entries: number
  status: Record<string, number>
  questions: OpenQuestion[]
}

export interface FileList {
  files: { name: string; description: string }[]
  traces: { name: string; size: number; uploaded: string }[]
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

// Long enough for a multi-step agent turn; short enough that a stuck request
// becomes a visible error instead of an endless "Thinking…".
const TIMEOUT_MS = 90_000

async function call<T>(path: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      signal: ctrl.signal,
      method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    })
  } catch (e) {
    if (ctrl.signal.aborted) throw new ApiError(504, 'That took too long. Your words were saved — try asking again.')
    throw e
  } finally {
    clearTimeout(timer)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText)
  return data as T
}

export const api = {
  me: () => call<Me>('/me'),
  registerOptions: (body: { password?: string; name?: string }) =>
    call<{ flowId: string; options: PublicKeyCredentialCreationOptionsJSON }>('/auth/register/options', { body }),
  registerVerify: (flowId: string, response: RegistrationResponseJSON) =>
    call<{ account: Account }>('/auth/register/verify', { body: { flowId, response } }),
  loginOptions: () => call<{ flowId: string; options: PublicKeyCredentialRequestOptionsJSON }>('/auth/login/options', { body: {} }),
  loginVerify: (flowId: string, response: AuthenticationResponseJSON) =>
    call<{ account: Account }>('/auth/login/verify', { body: { flowId, response } }),
  passkeys: () => call<{ passkeys: { id: string; device: string | null; created_at: string; last_used: string | null }[] }>('/passkeys'),
  signInDev: (name: string, password: string) => call<{ account: Account }>('/auth/dev', { body: { name, password } }),
  signOut: () => call<{ ok: true }>('/auth/logout', { body: {} }),
  converse: (conversationId: string, text: string) => call<ConverseReply>('/converse', { body: { conversationId, text } }),
  house: () => call<House>('/house'),
  dismissQuestion: (id: string) => call<{ ok: true }>(`/questions/${id}/dismiss`, { body: {} }),
  compact: () => call<{ runs: { compacted: number; summary: string }[] }>('/compact', { body: {}, timeoutMs: 600_000 }),
  files: () => call<FileList>('/files'),
  /** Re-file a place (or the whole house, with null) from what was said. A copy is saved first. */
  redo: (locationId: string | null) => call<RedoResult>('/redo', { body: { location_id: locationId }, timeoutMs: 600_000 }),
  snapshots: () => call<{ snapshots: SavedCopy[] }>('/snapshots'),
  restoreSnapshot: (id: string) => call<{ ok: true }>(`/snapshots/${id}/restore`, { body: {} }),
}

/** A saved copy of the house, taken before a redo (kept a week). */
export interface SavedCopy {
  id: string
  at: string
  label: string
}

export interface RedoResult {
  snapshot: SavedCopy
  scope: { location_id: string; path: string } | 'house'
  entries: number
  runs: { compacted: number; questions: string[]; summary: string }[]
  status: Record<string, number>
}

// ── offline outbox ────────────────────────────────────────────────────────

const OUTBOX = 'whi.outbox.v1'

export interface Queued {
  conversationId: string
  text: string
  at: string
}

export function queued(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]')
  } catch {
    return []
  }
}

function saveQueue(q: Queued[]): void {
  localStorage.setItem(OUTBOX, JSON.stringify(q))
}

export function enqueue(item: Queued): void {
  saveQueue([...queued(), item])
}

// Sends queued utterances oldest-first; stops at the first network failure.
export async function flushOutbox(onReply: (q: Queued, r: ConverseReply) => void): Promise<number> {
  let sent = 0
  for (;;) {
    const [next, ...rest] = queued()
    if (!next) return sent
    try {
      const r = await api.converse(next.conversationId, next.text)
      saveQueue(rest)
      sent++
      onReply(next, r)
    } catch (e) {
      if (e instanceof ApiError && e.status !== 401) saveQueue(rest) // server rejected it; don't retry forever
      else return sent
    }
  }
}

export function isOfflineError(e: unknown): boolean {
  return !(e instanceof ApiError) || !navigator.onLine
}
