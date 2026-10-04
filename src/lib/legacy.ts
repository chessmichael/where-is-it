// One-time import of data saved by the old, local-only versions of the app:
//   whi.items.v1  first version: a flat list of { name, location }
//   whi.house.v1  second version: a tree of places plus items
// The old address (where-is-it-OLD.pages.dev) now forwards here and passes
// that data along in the link's #fragment (never sent to a server); it's put
// into this browser's storage and offered for import. Each room (or batch of
// items) becomes one spoken-style description that goes through the agent
// like anything else the person says.

const KEY = 'whi.house.v1'
const FLAT_KEY = 'whi.items.v1'

/** Take data handed over from the old address (#import=…) into this browser's storage. */
export function acceptHandoff(): void {
  const hash = window.location.hash
  if (!hash.startsWith('#import=')) return
  try {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(hash.slice('#import='.length)))))
    const data = JSON.parse(json) as { house?: string | null; items?: string | null }
    if (data.house && !localStorage.getItem(KEY)) localStorage.setItem(KEY, data.house)
    if (data.items && !localStorage.getItem(FLAT_KEY)) localStorage.setItem(FLAT_KEY, data.items)
  } catch {
    // A damaged link just means nothing to import.
  }
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

interface OldNode {
  id: string
  name: string
  type: string
  parentId: string | null
  preposition?: string
}
interface OldItem {
  name: string
  locationId: string | null
  locationText?: string
  quantity?: number
  status?: string
}

export function legacyUtterances(): string[] {
  return [...houseUtterances(), ...flatUtterances()]
}

/** First version: "the keys are on the hook by the door", ten facts per utterance. */
function flatUtterances(): string[] {
  let items: { name: string; location: string }[]
  try {
    items = JSON.parse(localStorage.getItem(FLAT_KEY) ?? '[]')
    if (!Array.isArray(items)) return []
  } catch {
    return []
  }
  const facts = items.filter((it) => it?.name && it?.location).map((it) => `the ${it.name} is ${it.location}`)
  const out: string[] = []
  for (let i = 0; i < facts.length; i += 10) out.push(`${facts.slice(i, i + 10).join('; ')}.`)
  return out
}

function houseUtterances(): string[] {
  let model: { nodes: OldNode[]; items: OldItem[] }
  try {
    model = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!model?.items?.length) return []
  } catch {
    return []
  }
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const chain = (id: string | null): OldNode[] => {
    const out: OldNode[] = []
    for (let n = id ? byId.get(id) : undefined; n; n = n.parentId ? byId.get(n.parentId) : undefined) out.unshift(n)
    return out
  }
  const groups = new Map<string, string[]>()
  for (const it of model.items) {
    if (it.status && it.status !== 'present') continue
    const path = chain(it.locationId)
    const room = path[0]?.name ?? 'Unsorted'
    const what = `${it.quantity && it.quantity > 1 ? `${it.quantity} ` : ''}${it.name}`
    const where = path.length > 1
      ? path.slice(1).reverse().map((n) => `${n.preposition ?? 'in'} the ${n.name}`).join(' ')
      : it.locationText ?? 'somewhere in the room'
    groups.set(room, [...(groups.get(room) ?? []), `the ${what} is ${where}`])
  }
  return [...groups].map(([room, facts]) => `In the ${room}: ${facts.join('; ')}.`)
}

export function clearLegacy(): void {
  for (const key of [KEY, FLAT_KEY]) {
    const value = localStorage.getItem(key)
    if (value) localStorage.setItem(`${key}.imported`, value)
    localStorage.removeItem(key)
  }
}
