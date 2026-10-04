// ── The house model ──────────────────────────────────────────────────────
// The structured "separate format": a recursive tree of location nodes (rooms,
// furniture, containers, fixtures) plus items that attach to a node. Built by
// the LLM at startup / room re-evaluation; queried and updated offline.

export type NodeType = 'room' | 'furniture' | 'container' | 'fixture' | 'area'

export interface LocationNode {
  id: string
  name: string // "garage", "coffee table", "junk drawer"
  aliases: string[] // "the fridge" ~ "refrigerator"
  type: NodeType
  parentId: string | null // rooms hang off the house root (null)
  preposition?: string // how things sit here: "on" a table, "in" a drawer
  createdAt: number
  updatedAt: number
}

export type ItemStatus = 'present' | 'gone' | 'lent' | 'lost'

export interface Item {
  id: string
  name: string // "TV remote"
  aliases: string[]
  locationId: string | null // → a LocationNode
  locationText?: string // fallback when a phrase can't resolve to a node
  homeId?: string | null // where it belongs (habitual) — enables "put it away"
  previousLocationId?: string | null // for "put it back"
  status: ItemStatus
  quantity?: number
  note?: string
  createdAt: number
  updatedAt: number
}

export interface HouseModel {
  nodes: LocationNode[]
  items: Item[]
}

// What the LLM emits when building/re-evaluating a room (loose, pre-merge).
export interface DraftNode {
  name: string
  type: NodeType
  preposition?: string
  parentName?: string // furniture's containing furniture, e.g. drawer → dresser
  aliases?: string[]
}
export interface DraftItem {
  name: string
  locationName: string // the furniture/area it's in/on (matches a DraftNode or the room)
  aliases?: string[]
  quantity?: number
  note?: string
}
export interface RoomDraft {
  room: string
  roomAliases?: string[]
  nodes: DraftNode[]
  items: DraftItem[]
}

// ── Parsed intents (daily loop) ──────────────────────────────────────────

export interface ParsedStatement {
  kind: 'statement'
  items: { name: string; location: string }[]
}
export interface ParsedQuestion {
  kind: 'question'
  query: string
}
export interface ParsedContents {
  kind: 'contents'
  location: string
}
export interface ParsedRestore {
  kind: 'restore'
  name: string
}
export interface ParsedUnknown {
  kind: 'unknown'
  text: string
}
export type Parsed =
  | ParsedStatement
  | ParsedQuestion
  | ParsedContents
  | ParsedRestore
  | ParsedUnknown

export interface Answer {
  text: string
  matches: Item[]
}

// A pronoun standing in for a recently-mentioned item ("move it to the sofa").
export const PRONOUN_RE = /^(?:it|them|those|these|that|this|they|'em|em)$/i
