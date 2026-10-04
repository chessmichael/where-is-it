import { parse } from './parser'
import { rank } from './search'
import {
  addItem,
  getItems,
  getLastItem,
  itemsInNode,
  locationPhrase,
  moveItem,
  resolveItems,
  resolveNode,
  restoreItem,
  setLastItemId,
} from './model'
import { hasApiKey } from './settings'
import { smartAnswer, smartParse } from './claude'
import { PRONOUN_RE, type Item } from './types'

export type EngineResult =
  | { kind: 'added'; item: Item; spoken: string }
  | { kind: 'answer'; spoken: string; matches: Item[] }
  | { kind: 'unclear'; spoken: string; rawText: string }

// Treat a name as the same existing item at/above this match score.
const SAME_ITEM = 0.55

function copula(name: string): string {
  const last = name.trim().toLowerCase().split(/\s+/).pop() || ''
  const plural = /s$/.test(last) && !/(ss|us|is|ous)$/.test(last)
  return plural ? 'are' : 'is'
}

function listJoin(a: string[]): string {
  if (a.length <= 1) return a.join('')
  if (a.length === 2) return `${a[0]} and ${a[1]}`
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function resolveName(name: string): string | null {
  if (!PRONOUN_RE.test(name.trim())) return name
  const last = getLastItem()
  return last ? last.name : null
}

// Place an item at a spoken location phrase, resolving to a node when possible.
function setLocation(itemId: string, locationPhraseText: string): void {
  const node = resolveNode(locationPhraseText)
  if (node) moveItem(itemId, node.id)
  else moveItem(itemId, null, locationPhraseText)
}

function recordOne(name: string, location: string): { item: Item; created: boolean; prev?: string } {
  const matches = rank(name, getItems())
  const top = matches[0]
  if (top && top.score >= SAME_ITEM) {
    const before = locationPhrase(top.item)
    setLocation(top.item.id, location)
    setLastItemId(top.item.id)
    const after = getItems().find((i) => i.id === top.item.id)!
    return { item: after, created: false, prev: before }
  }
  const node = resolveNode(location)
  const item = node
    ? addItem({ name, locationId: node.id })
    : addItem({ name, locationText: location })
  setLastItemId(item.id)
  return { item, created: true }
}

function statementConfirmation(item: Item, created: boolean, prev?: string): string {
  const here = locationPhrase(item)
  const v = copula(item.name)
  if (created || !prev || prev === here) return `Got it — ${item.name} ${v} ${here}.`
  return `Updated — ${item.name} ${v} now ${here} (was ${prev}).`
}

function recordStatement(items: { name: string; location: string }[]): EngineResult {
  const saved: { item: Item; created: boolean; prev?: string }[] = []
  for (const it of items) {
    const name = resolveName(it.name)
    if (!name) continue
    saved.push(recordOne(name, it.location))
  }
  if (saved.length === 0) {
    return {
      kind: 'unclear',
      rawText: items.map((i) => i.name).join(', '),
      spoken: "I'm not sure which item you mean — try saying its name.",
    }
  }
  if (saved.length === 1) {
    const { item, created, prev } = saved[0]
    return { kind: 'added', item, spoken: statementConfirmation(item, created, prev) }
  }
  const names = saved.map((s) => s.item.name)
  return {
    kind: 'added',
    item: saved[0].item,
    spoken: `Got it — ${listJoin(names)} are ${locationPhrase(saved[0].item)}.`,
  }
}

async function answerQuestion(query: string): Promise<EngineResult> {
  const resolved = resolveName(query)
  if (resolved === null) {
    return {
      kind: 'unclear',
      rawText: query,
      spoken: "I'm not sure which item you mean — try saying its name.",
    }
  }

  if (hasApiKey()) {
    const inventory = getItems().map((i) => ({ name: i.name, location: locationPhrase(i) }))
    const smart = await smartAnswer(resolved, inventory)
    if (smart) {
      const matches = smart.matchedName
        ? getItems().filter((i) => i.name === smart.matchedName)
        : []
      if (matches[0]) setLastItemId(matches[0].id)
      return { kind: 'answer', spoken: smart.answer, matches }
    }
  }

  const found = resolveItems(resolved)
  if (found.length === 0) {
    return { kind: 'answer', spoken: `I don't have a record of your ${resolved}.`, matches: [] }
  }
  const best = found[0]
  setLastItemId(best.id)
  let spoken = `I think your ${best.name} ${copula(best.name)} ${locationPhrase(best)}.`
  if (found.length > 1) spoken += ` (I found ${found.length} possible matches.)`
  return { kind: 'answer', spoken, matches: found.slice(0, 5) }
}

export async function handleInput(text: string): Promise<EngineResult> {
  const parsed = parse(text)

  if (parsed.kind === 'statement') {
    return recordStatement(parsed.items)
  }

  if (parsed.kind === 'restore') {
    const name = resolveName(parsed.name)
    if (!name) {
      return {
        kind: 'unclear',
        rawText: parsed.name,
        spoken: "I'm not sure which item you mean — try saying its name.",
      }
    }
    const found = resolveItems(name)
    const item = found[0]
    if (!item) {
      return { kind: 'answer', spoken: `I don't have a record of your ${name}.`, matches: [] }
    }
    const res = restoreItem(item.id)
    if (!res) {
      return {
        kind: 'answer',
        spoken: `I don't have an earlier spot recorded for your ${item.name} — it ${copula(item.name)} still ${locationPhrase(item)}.`,
        matches: [item],
      }
    }
    setLastItemId(res.item.id)
    return {
      kind: 'added',
      item: res.item,
      spoken: `Done — ${res.item.name} ${copula(res.item.name)} back ${res.to} (was ${res.from}).`,
    }
  }

  if (parsed.kind === 'contents') {
    const node = resolveNode(parsed.location)
    const matches = node ? itemsInNode(node.id) : []
    if (matches.length === 0) {
      return {
        kind: 'answer',
        spoken: `I don't have anything recorded ${parsed.location}.`,
        matches: [],
      }
    }
    return {
      kind: 'answer',
      spoken: `${capitalize(parsed.location)}: ${listJoin(matches.map((m) => m.name))}.`,
      matches,
    }
  }

  if (parsed.kind === 'question') {
    return answerQuestion(parsed.query)
  }

  // Couldn't classify with rules — try the smart parser if available.
  if (hasApiKey()) {
    const smart = await smartParse(text)
    if (smart?.kind === 'statement' && smart.name && smart.location) {
      return recordStatement([{ name: smart.name, location: smart.location }])
    }
    if (smart?.kind === 'question' && smart.name) {
      return answerQuestion(smart.name)
    }
  }

  return {
    kind: 'unclear',
    rawText: text,
    spoken:
      "I didn't quite catch that. Try \"the keys are on the hook\" or \"where are my keys?\"",
  }
}
