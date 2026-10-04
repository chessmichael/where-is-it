import type { Observation } from '../agent/observations'

// The shapes of rows in each table (see schema.ts for the columns' meaning).

export const LOCATION_KINDS = ['room', 'furniture', 'storage', 'shelf', 'container', 'area', 'fixture'] as const
export const ITEM_STATUSES = ['present', 'lent', 'gone', 'lost'] as const

export type InboxStatus =
  | 'received' // saved, agent hasn't finished yet
  | 'pending_compaction' // agent recorded observations; waiting for tidy-up
  | 'needs_clarification' // waiting on an answer to a question
  | 'nothing_to_store' // a question or chit-chat
  | 'compacted' // filed into the house tables
  | 'error' // the agent failed; tidy-up will read the raw text instead

export interface InboxEntry {
  id: string
  at: string
  conversation: string
  said: string
  observations: Observation[]
  agent_reply: string | null
  status: InboxStatus
  compacted_at: string | null
  note: string | null
}

export interface Question {
  id: string
  at: string
  conversation: string | null
  inbox_ids: string[]
  question: string
  options: string[]
  status: 'open' | 'answered' | 'dismissed'
  answer: string | null
  answered_by: string | null
}

export interface Location {
  id: string
  name: string
  kind: string
  parent_id: string | null
  preposition: string
  position: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export interface Item {
  id: string
  name: string
  category: string | null
  description: string | null
  quantity: number | null
  location_id: string | null
  location_note: string | null
  status: string
  lent_to: string | null
  place_id: string | null
  created_at: string
  updated_at: string
}

export interface Detail {
  key: string
  value: string
}

/** One level of a location path, as the agent describes it. */
export interface PathStep {
  name: string
  kind?: string | null
  preposition?: string | null
}
