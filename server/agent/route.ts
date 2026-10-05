import type { HouseDb } from '../db/house'

// Which model hears an utterance, when a cheaper "fast" model is configured
// (LLM_FAST_MODEL). In the eval the cheap model matched the strong one on
// plain captures and lookups ("the drill is in the garage", "where's my
// passport?") but fell apart on anything that has to reason about the house's
// structure: stacks, positions, look-alike units, layouts, follow-up answers.
// So the fast model gets only short, plain turns; everything else — and all
// of tidy-up — stays on the strong model.

const STRUCTURAL =
  /\b(left|right|middle|cent(er|re)|stack(ed)?|swap(ped)?|flip(ped)?|order|reverse|above|below|beneath|under(neath)?|behind|in front|next to|beside|between|other|another|ones?|first|second|third|fourth|last|\d+(st|nd|rd|th)|moved?|instead|actually|no wait|i meant|all the|stuff|things)\b/i

export function needsStrongModel(text: string, db: HouseDb, conversation: string): boolean {
  if (text.trim().split(/\s+/).length > 25) return true // long descriptions
  if (STRUCTURAL.test(text)) return true // positions, stacks, moves, corrections, groups
  if (db.questions.open().some((q) => q.conversation === conversation)) return true // answering a question needs context
  return false
}
