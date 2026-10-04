import type { RoomDraft } from './types'
import { getApiKey, getModel } from './settings'

// Optional "smart" layer. The SDK is dynamically imported so the offline core
// never depends on it and the network bundle only loads when a key is present.

let clientPromise: Promise<any> | null = null

async function getClient(): Promise<any | null> {
  const apiKey = getApiKey()
  if (!apiKey) return null
  if (!clientPromise) {
    clientPromise = import('@anthropic-ai/sdk').then(
      ({ default: Anthropic }) =>
        new Anthropic({ apiKey, dangerouslyAllowBrowser: true }),
    )
  }
  return clientPromise
}

export function resetClient(): void {
  clientPromise = null
}

function firstJson(content: any[]): any {
  const block = content.find((b) => b.type === 'text')
  if (!block) return null
  try {
    return JSON.parse(block.text)
  } catch {
    return null
  }
}

// ── Startup / room re-evaluation: build a structured room from narration ──

const ROOM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    room: { type: 'string' },
    roomAliases: { type: 'array', items: { type: 'string' } },
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['room', 'furniture', 'container', 'fixture', 'area'] },
          preposition: { type: 'string' },
          parentName: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'type'],
      },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          locationName: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          quantity: { type: 'number' },
          note: { type: 'string' },
        },
        required: ['name', 'locationName'],
      },
    },
  },
  required: ['room', 'nodes', 'items'],
}

const ROOM_SYSTEM = `You convert a person's spoken description of ONE room in their home into a structured inventory.

Output:
- "room": the room's name (e.g. "kitchen", "garage", "master bedroom"). "roomAliases": other names they might use for it.
- "nodes": the furniture and storage spots in the room where things are kept. For each:
  - "name": a concise noun ("coffee table", "junk drawer", "pegboard", "hall closet").
  - "type": one of "furniture" (tables, shelves, dressers, sofas), "container" (drawers, boxes, bins, fridge, cabinets), "fixture" (hooks, pegboards, racks), or "area" (a corner, the floor, a wall).
  - "preposition": how items rest there — "on" for surfaces, "in" for drawers/containers/closets, "by"/"under"/"behind" for areas.
  - "parentName": if this spot is inside another spot you listed (a drawer inside a dresser), name that parent. Otherwise omit.
- "items": the objects in the room. For each: "name" (concise), "locationName" (the node name it's in/on; use the room name if it's just loose in the room), optional "quantity" and "note".

Infer reasonable furniture even if only implied (if they say "the remote is on the coffee table", create a "coffee table" node). Keep names short and natural — what the person would say. Do not invent items they didn't mention. Respond only with the structured object.`

// Note: unlike the daily-loop helpers (which fall back to rules on failure),
// room-building has no fallback, so this surfaces errors instead of swallowing
// them — the caller shows the message so problems are diagnosable.
export async function buildRoom(
  narration: string,
  roomHint?: string,
): Promise<RoomDraft | null> {
  const client = await getClient()
  if (!client) return null
  const res = await client.messages.create({
    model: getModel(),
    max_tokens: 4000,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', name: 'room', schema: ROOM_SCHEMA },
    },
    system: ROOM_SYSTEM,
    messages: [
      {
        role: 'user',
        content: roomHint ? `Room: ${roomHint}\n\nDescription: ${narration}` : narration,
      },
    ],
  })
  const obj = firstJson(res.content) as RoomDraft | null
  if (!obj || typeof obj.room !== 'string' || !Array.isArray(obj.nodes) || !Array.isArray(obj.items)) {
    throw new Error('The model returned an unexpected response. Please try again.')
  }
  return obj
}

// ── Daily loop fallbacks ──────────────────────────────────────────────────

export interface SmartParse {
  kind: 'statement' | 'question'
  name: string
  location: string
}

export async function smartParse(text: string): Promise<SmartParse | null> {
  const client = await getClient()
  if (!client) return null
  try {
    const res = await client.messages.create({
      model: getModel(),
      max_tokens: 300,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          name: 'intent',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['statement', 'question'] },
              name: { type: 'string' },
              location: { type: 'string' },
            },
            required: ['kind', 'name', 'location'],
          },
        },
      },
      system:
        'You convert short spoken phrases about where household items are kept into structured data. ' +
        'A "statement" records that an item is in a location ("the remote is on the coffee table" → name="TV remote", location="on the coffee table"). ' +
        'A "question" asks where an item is ("where are my keys" → name="keys", location=""). ' +
        'Normalize the item to a concise noun phrase. Keep the location preposition. Respond only with the structured object.',
      messages: [{ role: 'user', content: text }],
    })
    const obj = firstJson(res.content)
    if (!obj || (obj.kind !== 'statement' && obj.kind !== 'question')) return null
    return { kind: obj.kind, name: obj.name ?? '', location: obj.location ?? '' }
  } catch {
    return null
  }
}

export interface SmartAnswer {
  answer: string
  matchedName: string | null
}

// Conversational answer over a pre-rendered inventory ({name, location} pairs).
export async function smartAnswer(
  question: string,
  inventory: { name: string; location: string }[],
): Promise<SmartAnswer | null> {
  const client = await getClient()
  if (!client) return null
  try {
    const res = await client.messages.create({
      model: getModel(),
      max_tokens: 300,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          name: 'answer',
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              answer: { type: 'string' },
              matchedName: { type: ['string', 'null'] },
            },
            required: ['answer', 'matchedName'],
          },
        },
      },
      system:
        'You help someone find household items. Given their question and a JSON inventory of items and locations, ' +
        'find the best matching item and answer in one short, natural sentence ("I think your TV remote is on the coffee table."). ' +
        'Match loosely (synonyms, partial names). If nothing matches, say you have no record of it and set matchedName to null. ' +
        'Set matchedName to the exact item name from the inventory when you find a match.',
      messages: [
        {
          role: 'user',
          content: `Inventory:\n${JSON.stringify(inventory)}\n\nQuestion: ${question}`,
        },
      ],
    })
    const obj = firstJson(res.content)
    if (!obj || typeof obj.answer !== 'string') return null
    return { answer: obj.answer, matchedName: obj.matchedName ?? null }
  } catch {
    return null
  }
}
