import type { HouseDb } from './house'
import { normalize } from './search'
import type { Location } from './types'

// A check run before tidy-up finishes: places and items touched in this run
// that a person couldn't tell apart or find later. Each finding is a sentence
// for the agent, which either fixes it (a position, a layout cell, a better
// name) or asks the person. Deliberately narrow — false alarms cost a question.

const POSITION_WORDS = /\b(left|right|middle|center|top|bottom|upper|lower|front|back|first|second|third|other|another|new|\d+(st|nd|rd|th)?)\b/g
const RELATIVE_NAME = /\b(below|above|beneath|under(neath)?|next to|beside|behind|in front of|to the (left|right))\b/
const CATCH_ALL_ITEM = /^(the )?(other|another|second|2nd|extra) /i
const LOOKALIKE_KINDS = new Set(['furniture', 'storage', 'container', 'shelf'])

export function houseCheck(db: HouseDb, since: string): string[] {
  const findings: string[] = []
  const locations = db.locations.all()
  const touched = (l: { created_at: string; updated_at: string }) => l.created_at >= since || l.updated_at >= since
  const label = (l: Location) => `“${l.name}” (${l.id})`

  // Look-alike places side by side, at least one with nothing telling it apart.
  const byParent = new Map<string, Location[]>()
  for (const l of locations) {
    if (!l.parent_id || !LOOKALIKE_KINDS.has(l.kind)) continue
    const key = `${l.parent_id}|${normalize(l.name).replace(POSITION_WORDS, '').replace(/\s+/g, ' ').trim()}`
    byParent.set(key, [...(byParent.get(key) ?? []), l])
  }
  for (const group of byParent.values()) {
    if (group.length < 2 || !group.some(touched)) continue
    const unmarked = group.filter((l) => !l.position && !l.grid)
    if (!unmarked.length) continue
    findings.push(
      `${group.length} look-alike places in ${db.locations.describedPath(group[0].parent_id)}: ${group.map(label).join(', ')}. ` +
        `${unmarked.map(label).join(', ')} ${unmarked.length === 1 ? 'has' : 'have'} no position, so the person can't tell which is which. ` +
        `Set a position from what they said, or ask them which one it is (e.g. "is the camping one the left or the right unit?").`,
    )
  }

  // Places named only by their neighbor ("Shelf below upper right shelf").
  for (const l of locations) {
    if (!touched(l) || !LOOKALIKE_KINDS.has(l.kind) || !RELATIVE_NAME.test(normalize(l.name))) continue // an area like "Under the bed" is fine
    findings.push(
      `${label(l)} is named by where it is relative to another place. Give it a plain name (what it is or holds) and record where it is as a position or a layout cell (grid) in its parent — ` +
        `if how the parts are arranged isn't clear, ask, and show your understanding with a diagram.`,
    )
  }

  // Catch-all item names ("Other speaker").
  for (const it of db.items.all()) {
    if ((it.created_at >= since || it.updated_at >= since) && CATCH_ALL_ITEM.test(it.name))
      findings.push(`Item “${it.name}” (${it.id}) is named only as "the other one". Name it by what it is or where it is, so "where's the ${it.name.replace(CATCH_ALL_ITEM, '')}?" has a clear answer.`)
  }
  return findings
}
