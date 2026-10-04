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
}

export interface ConverseReply {
  conversationId: string
  inboxId: string
  reply: string
  question: AgentQuestion | null
  stored: number
  error?: string
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
}

export interface HouseNode {
  id: string
  name: string
  kind: string
  preposition: string
  description?: string
  aliases?: string[]
  items: HouseItem[]
  children: HouseNode[]
}

export interface OpenQuestion {
  id: string
  question: string
  options: string[]
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

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body !== undefined ? 'POST' : 'GET'),
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
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
  compact: () => call<{ runs: { compacted: number; summary: string }[] }>('/compact', { body: {} }),
  files: () => call<FileList>('/files'),
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
