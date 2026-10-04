import type {
  HouseModel,
  Item,
  ItemStatus,
  LocationNode,
  NodeType,
  RoomDraft,
} from './types'
import { normalize, rank } from './search'

const KEY = 'whi.house.v1'

// Single localStorage-backed source of truth. Kept behind this module so it
// can be swapped for a synced backend (the future "sharing" phase) later.

function emptyModel(): HouseModel {
  return { nodes: [], items: [] }
}

export function load(): HouseModel {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyModel()
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.items)) {
      return emptyModel()
    }
    return parsed
  } catch {
    return emptyModel()
  }
}

export function save(m: HouseModel): void {
  localStorage.setItem(KEY, JSON.stringify(m))
}

export function reset(): void {
  save(emptyModel())
}

function id(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`
}

// ── Reads ────────────────────────────────────────────────────────────────

export function getHouse(): HouseModel {
  return load()
}
export function getNodes(): LocationNode[] {
  return load().nodes
}
export function getItems(): Item[] {
  return load().items
}
export function getRooms(): LocationNode[] {
  return load().nodes.filter((n) => n.type === 'room')
}
export function getNode(nodeId: string, m = load()): LocationNode | null {
  return m.nodes.find((n) => n.id === nodeId) ?? null
}
export function getItem(itemId: string, m = load()): Item | null {
  return m.items.find((i) => i.id === itemId) ?? null
}
export function childrenOf(parentId: string | null, m = load()): LocationNode[] {
  return m.nodes.filter((n) => n.parentId === parentId)
}

// All node ids in a subtree, inclusive of the root node.
export function subtreeIds(nodeId: string, m = load()): Set<string> {
  const out = new Set<string>([nodeId])
  let added = true
  while (added) {
    added = false
    for (const n of m.nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id)
        added = true
      }
    }
  }
  return out
}

// Items located in a node (and, by default, anything nested below it).
export function itemsInNode(nodeId: string, deep = true, m = load()): Item[] {
  const ids = deep ? subtreeIds(nodeId, m) : new Set([nodeId])
  return m.items.filter((i) => i.locationId && ids.has(i.locationId))
}

// The room a node ultimately sits in.
export function roomOf(nodeId: string, m = load()): LocationNode | null {
  let cur = getNode(nodeId, m)
  while (cur) {
    if (cur.type === 'room' || cur.parentId === null) return cur
    cur = getNode(cur.parentId, m)
  }
  return null
}

// Render an item's location as a natural phrase: "on the coffee table in the
// Living Room", "in the garage", or its free-text fallback.
export function locationPhrase(item: Item, m = load()): string {
  if (item.locationId) {
    const node = getNode(item.locationId, m)
    if (node) {
      if (node.type === 'room') return `in the ${node.name}`
      const prep = node.preposition || 'in'
      const room = roomOf(node.id, m)
      const base = `${prep} the ${node.name}`
      return room && room.id !== node.id ? `${base} in the ${room.name}` : base
    }
  }
  if (item.locationText) return item.locationText
  return 'somewhere (not recorded)'
}

// ── Writes ──────────────────────────────────────────────────────────────

export function addNode(
  name: string,
  type: NodeType,
  parentId: string | null,
  preposition?: string,
  aliases: string[] = [],
): LocationNode {
  const m = load()
  const now = Date.now()
  const node: LocationNode = {
    id: id(),
    name: name.trim(),
    aliases,
    type,
    parentId,
    preposition,
    createdAt: now,
    updatedAt: now,
  }
  m.nodes.push(node)
  save(m)
  return node
}

export function updateNode(
  nodeId: string,
  patch: Partial<Pick<LocationNode, 'name' | 'aliases' | 'type' | 'parentId' | 'preposition'>>,
): void {
  const m = load()
  const n = m.nodes.find((x) => x.id === nodeId)
  if (!n) return
  Object.assign(n, patch)
  n.updatedAt = Date.now()
  save(m)
}

// Delete a node and its whole subtree; orphaned items fall back to free text.
export function deleteNode(nodeId: string): void {
  const m = load()
  const ids = subtreeIds(nodeId, m)
  for (const it of m.items) {
    if (it.locationId && ids.has(it.locationId)) {
      it.locationText = locationPhrase(it, m)
      it.locationId = null
    }
  }
  m.nodes = m.nodes.filter((n) => !ids.has(n.id))
  save(m)
}

export function addItem(fields: {
  name: string
  aliases?: string[]
  locationId?: string | null
  locationText?: string
  quantity?: number
  note?: string
  status?: ItemStatus
}): Item {
  const m = load()
  const now = Date.now()
  const item: Item = {
    id: id(),
    name: fields.name.trim(),
    aliases: fields.aliases ?? [],
    locationId: fields.locationId ?? null,
    locationText: fields.locationText,
    status: fields.status ?? 'present',
    quantity: fields.quantity,
    note: fields.note,
    createdAt: now,
    updatedAt: now,
  }
  m.items.push(item)
  save(m)
  return item
}

export function updateItem(itemId: string, patch: Partial<Item>): void {
  const m = load()
  const it = m.items.find((x) => x.id === itemId)
  if (!it) return
  Object.assign(it, patch)
  it.updatedAt = Date.now()
  save(m)
}

export function deleteItem(itemId: string): void {
  const m = load()
  m.items = m.items.filter((i) => i.id !== itemId)
  save(m)
}

// Move an item to a node (remembering where it was, for "put it back").
export function moveItem(itemId: string, locationId: string | null, locationText?: string): void {
  const m = load()
  const it = m.items.find((x) => x.id === itemId)
  if (!it) return
  const changed = it.locationId !== locationId || (locationText && it.locationText !== locationText)
  if (changed && it.locationId) it.previousLocationId = it.locationId
  it.locationId = locationId
  it.locationText = locationId ? undefined : locationText
  it.updatedAt = Date.now()
  save(m)
}

// ── Resolution (basic; enhanced in the resolver phase) ────────────────────

const PLACE_PREP_RE =
  /^(?:on top of|in front of|next to|underneath|inside of|inside|beside|behind|under|near|around|onto|into|by|in|on|at|the|a|an|my|our|your)\s+/i

function stripPlacePreps(phrase: string): string {
  let p = phrase.trim()
  let prev = ''
  while (prev !== p) {
    prev = p
    p = p.replace(PLACE_PREP_RE, '').trim()
  }
  return p
}

// Resolve a spoken location phrase ("on the sofa", "the junk drawer") to a node.
export function resolveNode(phrase: string, m = load()): LocationNode | null {
  const cleaned = stripPlacePreps(phrase) || phrase
  const ranked = rank(cleaned, m.nodes)
  return ranked[0]?.score >= 0.5 ? ranked[0].item : null
}

// Resolve an item phrase ("my keys") to candidate items, best first.
export function resolveItems(phrase: string, m = load()): Item[] {
  return rank(phrase, m.items).map((r) => r.item)
}

// Send an item back to where it was before its last move ("put it back").
export interface RestoreResult {
  item: Item
  from: string
  to: string
}
export function restoreItem(itemId: string): RestoreResult | null {
  const m = load()
  const it = m.items.find((x) => x.id === itemId)
  if (!it || !it.previousLocationId) return null
  const fromPhrase = locationPhrase(it, m)
  const prev = it.previousLocationId
  it.previousLocationId = it.locationId
  it.locationId = prev
  it.locationText = undefined
  it.updatedAt = Date.now()
  save(m)
  return { item: it, from: fromPhrase, to: locationPhrase(it, m) }
}

// The most-recently touched item, for pronouns ("move it…", "put it back").
const LAST_KEY = 'whi.lastItem'
export function setLastItemId(itemId: string): void {
  localStorage.setItem(LAST_KEY, itemId)
}
export function getLastItem(): Item | null {
  const id = localStorage.getItem(LAST_KEY)
  if (!id) return null
  return getItem(id)
}

// ── Merge an LLM-built room draft into the model ──────────────────────────

function nameMatches(node: LocationNode, name: string): boolean {
  const n = normalize(name)
  if (normalize(node.name) === n) return true
  return node.aliases.some((a) => normalize(a) === n)
}

export interface MergeSummary {
  roomId: string
  roomName: string
  addedNodes: number
  addedItems: number
  reusedRoom: boolean
}

export function mergeRoomDraft(draft: RoomDraft): MergeSummary {
  const m = load()
  const now = Date.now()

  // Find or create the room.
  let room = m.nodes.find((n) => n.type === 'room' && nameMatches(n, draft.room))
  const reusedRoom = !!room
  if (!room) {
    room = {
      id: id(),
      name: draft.room.trim(),
      aliases: draft.roomAliases ?? [],
      type: 'room',
      parentId: null,
      createdAt: now,
      updatedAt: now,
    }
    m.nodes.push(room)
  }

  const roomSubtree = () => subtreeIds(room!.id, m)
  const findInRoom = (name: string) =>
    m.nodes.find((n) => roomSubtree().has(n.id) && n.id !== room!.id && nameMatches(n, name))

  // Pass 1: create furniture/containers parented to the room (dedupe by name).
  const nameToId = new Map<string, string>()
  let addedNodes = 0
  for (const dn of draft.nodes) {
    const existing = findInRoom(dn.name)
    if (existing) {
      nameToId.set(normalize(dn.name), existing.id)
      continue
    }
    const node: LocationNode = {
      id: id(),
      name: dn.name.trim(),
      aliases: dn.aliases ?? [],
      type: dn.type,
      parentId: room.id,
      preposition: dn.preposition,
      createdAt: now,
      updatedAt: now,
    }
    m.nodes.push(node)
    nameToId.set(normalize(dn.name), node.id)
    addedNodes++
  }

  // Pass 2: reparent nodes that named a containing piece of furniture.
  for (const dn of draft.nodes) {
    if (!dn.parentName) continue
    const childId = nameToId.get(normalize(dn.name))
    const parentId = nameToId.get(normalize(dn.parentName)) ?? findInRoom(dn.parentName)?.id
    if (childId && parentId && childId !== parentId) {
      const child = m.nodes.find((n) => n.id === childId)
      if (child) child.parentId = parentId
    }
  }

  // Items: attach to the named furniture, else to the room itself.
  let addedItems = 0
  for (const di of draft.items) {
    const locId =
      nameToId.get(normalize(di.locationName)) ?? findInRoom(di.locationName)?.id ?? room.id
    m.items.push({
      id: id(),
      name: di.name.trim(),
      aliases: di.aliases ?? [],
      locationId: locId,
      status: 'present',
      quantity: di.quantity,
      note: di.note,
      createdAt: now,
      updatedAt: now,
    })
    addedItems++
  }

  save(m)
  return {
    roomId: room.id,
    roomName: room.name,
    addedNodes,
    addedItems,
    reusedRoom,
  }
}
