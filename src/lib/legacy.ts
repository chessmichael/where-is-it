// One-time import of data saved in this browser by the old, local-only
// version (localStorage key whi.house.v1). Each room becomes one spoken-style
// description that goes through the agent like anything else the person says.

const KEY = 'whi.house.v1'

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
  localStorage.setItem(`${KEY}.imported`, localStorage.getItem(KEY) ?? '')
  localStorage.removeItem(KEY)
}
