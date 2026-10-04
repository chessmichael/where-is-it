import type { Parsed } from './types'

// Resting-location prepositions, always recognized. (\b boundaries mean "onto"
// is never mis-matched as "on", so order among these doesn't matter.)
const REST_PREPOSITIONS = [
  'on top of',
  'in front of',
  'next to',
  'underneath',
  'inside of',
  'inside',
  'beside',
  'behind',
  'between',
  'above',
  'below',
  'under',
  'near',
  'around',
  'onto',
  'into',
  'by',
  'in',
  'on',
  'at',
]

// Destination prepositions, only recognized when the sentence is phrased as a
// move ("moving the keys TO the sofa"). "to" is ambiguous otherwise ("the key
// to the shed is under the mat"), so it's gated behind a move verb.
const MOVE_PREPOSITIONS = ['over to', 'to']

// Prepositions that can introduce a place in a contents query / reverse lookup.
const CONTENTS_PREPOSITIONS = [
  'on top of',
  'in front of',
  'next to',
  'underneath',
  'inside',
  'beside',
  'behind',
  'under',
  'near',
  'around',
  'by',
  'in',
  'on',
  'at',
]

function clean(s: string): string {
  return s
    .trim()
    .replace(/[.?!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripLeadingArticle(s: string): string {
  return s.replace(/^(?:the|my|our|your|a|an|some)\s+/i, '').trim()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function prepRe(preps: string[]): RegExp {
  return new RegExp('\\b(' + preps.map(escapeRe).join('|') + ')\\b', 'i')
}
const REST_RE = prepRe(REST_PREPOSITIONS)
const MOVE_RE = prepRe([...MOVE_PREPOSITIONS, ...REST_PREPOSITIONS])
const CONTENTS_RE = prepRe(CONTENTS_PREPOSITIONS)

// Verbs that mark a relocation, which lets us treat "to" as a destination.
const MOVE_VERB_RE =
  /(?:^|\s)(?:mov(?:e|ed|es|ing)|relocat\w+|shift\w*|took|takes?|taking|bring|brings|bringing|brought)(?:\s|$)|\bback\b/i

// Leading framing that isn't part of the item or location.
const LEADING_FRAMING_RE =
  /^(?:there(?:'s| is| are)|here(?:'s| is| are))\s+/i
const LEADING_HAVE_RE =
  /^(?:i(?:'ve| ve)? (?:also )?(?:have|got)|i have got|we(?:'ve| ve)? (?:have|got)|you(?:'ll| can)? find|you can find|remember,?)\s+/i

// Leading placement verb framing ("I put", "I'm leaving", "move", …).
const LEADING_VERB_RE =
  /^(i'?m\s+|i\s+am\s+|i\s+|i'?ve\s+|i\s+have\s+)?(just\s+|already\s+)?(put|putting|place|placing|placed|leave|leaving|left|move|moving|moved|store|storing|stored|set|setting|relocate|relocating|relocated|shift|shifting|shifted|take|taking|took|bring|bringing|brought|keep|keeping|kept|stick|sticking|stuck|stash|stashing|stashed|hang|hanging|hung|drop|dropping|dropped|stow|stowing|stowed)\s+/i

// Turn a destination phrase into a natural resting phrase: "onto"→"on",
// "into"→"in", "to/over to the sofa"→"at the sofa", "back into…"→"in…".
function normalizeLocation(loc: string): string {
  let l = loc.replace(/^back\s+/i, '')
  l = l.replace(/^onto\b/i, 'on')
  l = l.replace(/^into\b/i, 'in')
  l = l.replace(/^(?:over\s+to|to)\b/i, 'at')
  return clean(l)
}

// Strip trailing filler so the item name is just the thing ("the keys are now"
// → "keys", "the keys back" → "keys", "the leash hangs" → "leash").
const TRAILING_FILLER =
  /\s+(?:is|are|am|was|were|'s|now|currently|right now|back|away|somewhere|someplace|anywhere|hangs?|sits?|lives?|stays?|goes?|belongs?|rests?|located|kept|going)\s*$/i
function stripTrailingFiller(s: string): string {
  let prev: string
  let out = s
  do {
    prev = out
    out = out.replace(TRAILING_FILLER, '').trim()
  } while (out !== prev)
  return out
}

const QUESTION_STARTERS = [
  'where',
  'wheres',
  "where's",
  'find',
  'locate',
  'do you know where',
  'have you seen',
  'seen',
  'what room',
  'which room',
  'what location',
]

// Reverse lookup: "what's in the garage?", "what do I have on my desk?"
function asContents(text: string): string | null {
  const t = clean(text)
  // Longer, more-specific openers first (JS alternation is leftmost-first).
  const m = t.match(
    /^(?:what do i have|what have i got|what'?ve i got|what(?:'s| is| are| ?s)?|whats|anything|everything)\s+/i,
  )
  if (!m) return null
  const rest = t.slice(m[0].length)
  const pm = CONTENTS_RE.exec(rest)
  // Must start with a preposition (else it's "what room is…", not a place).
  if (!pm || pm.index !== 0) return null
  const loc = clean(rest)
  return loc || null
}

// "where is X?" / "what room is X in?"
function asQuestion(text: string): string | null {
  const lower = text.toLowerCase()
  const isQ =
    text.includes('?') ||
    QUESTION_STARTERS.some((q) => lower.startsWith(q) || lower.includes(' ' + q + ' '))
  if (!isQ) return null

  let q = clean(text)
  q = q.replace(/^(?:do you know|can you tell me|could you tell me|please|hey)\s+/i, '')
  q = q.replace(/^(?:what|which)\s+room\s+(?:is|are|was|were)?\b/i, '')
  q = q.replace(/^where(?:'s| is| are| was| were)?\b/i, '')
  q = q.replace(/^\s*(?:did|do|does|can|could|should|will|would)\b/i, '')
  q = q.replace(/^\s*(?:i|we|you)\b/i, '')
  q = q.replace(
    /\b(?:find|locate|located|put|placed|left|leave|stored|store|kept|keep|set|seen|have you seen|right now|now|again)\b/gi,
    '',
  )
  q = stripLeadingArticle(clean(q))
  // Drop a dangling trailing preposition/copula ("the vacuum in" → "vacuum",
  // "the charger is" → "charger").
  let prev = ''
  while (prev !== q) {
    prev = q
    q = q.replace(/\s+(?:is|are|was|were|in|on|at|inside|under|by|near|located|kept|stored)\s*$/i, '')
    q = clean(q)
  }
  q = stripLeadingArticle(q)
  return q || null
}

// "put the keys back" → restore previous location. Only matches when "back" is
// terminal (no explicit destination after it, e.g. NOT "put it back on the hook").
function asRestore(text: string): string | null {
  const t = clean(text)
  const m = t.match(
    /^(?:i'?m\s+|i\s+)?(?:put|putting|move|moving|moved|return|returning|returned|stick|sticking|stuck)\s+(.+?)\s+back(?:\s+(?:where it (?:was|belongs|goes|lives)|(?:to|in) its (?:spot|place|home|usual spot)))?$/i,
  )
  if (!m) return null
  const name = stripLeadingArticle(clean(m[1]))
  return name || null
}

// Parse a statement into one or more {name, location} pairs.
function asStatement(text: string): { name: string; location: string }[] | null {
  let t0 = clean(text)

  // A move ("I moved the keys to the sofa") lets "to" act as a destination.
  const isMove = MOVE_VERB_RE.test(t0)

  // Peel leading framing: "there's a …", "I have …", then placement verbs.
  t0 = t0.replace(LEADING_FRAMING_RE, '')
  t0 = t0.replace(LEADING_HAVE_RE, '')
  const t = t0.replace(LEADING_VERB_RE, '')

  // Split at the earliest preposition in the sentence.
  const m = (isMove ? MOVE_RE : REST_RE).exec(t)
  if (!m || m.index <= 0) return null

  let namePart = t.slice(0, m.index)
  const locPart = t.slice(m.index)

  namePart = stripTrailingFiller(namePart)
  const location = normalizeLocation(locPart)
  if (!location) return null

  // List splitting: "the milk, eggs, and cheese" → three items at one place.
  // Normalize "and"/"&"/Oxford-comma joins to a single comma first.
  const names = namePart
    .replace(/,?\s+and\s+|\s*&\s*/gi, ',')
    .split(/\s*,\s*/)
    .map((n) => stripLeadingArticle(clean(n)))
    .filter(Boolean)

  if (names.length === 0) return null
  return names.map((name) => ({ name, location }))
}

export function parse(text: string): Parsed {
  const raw = clean(text)
  if (!raw) return { kind: 'unknown', text: raw }

  // 1. Reverse lookup ("what's in the garage") before anything else, since it
  //    contains a preposition and would otherwise look like a statement.
  const contents = asContents(raw)
  if (contents) return { kind: 'contents', location: contents }

  // 2. Questions take priority over statements.
  const q = asQuestion(raw)
  if (q) return { kind: 'question', query: q }

  // 3. "put X back" restore.
  const restore = asRestore(raw)
  if (restore) return { kind: 'restore', name: restore }

  // 4. Statement(s).
  const items = asStatement(raw)
  if (items && items.length) return { kind: 'statement', items }

  return { kind: 'unknown', text: raw }
}
