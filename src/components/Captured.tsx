import type { Captured as Obs } from '../lib/api'

// A plain-language receipt of what the agent recorded for one utterance, so
// the person can catch mistakes while they're still talking.

const ICON: Record<string, string> = {
  place: '📍', move: '➡️', remove: '🗑️', lend: '🤝', lost: '❓', describe_location: '🗄️',
  detail: '🏷️', relate: '🔗', correct: '✏️', answer: '💬',
}

const path = (p: string[] | null) => (p && p.length ? p.join(' › ') : '?')

export function describe(o: Obs): string {
  const what = `${o.quantity && o.quantity > 1 ? `${o.quantity} × ` : ''}${o.item ?? 'something'}`
  const details = o.details?.length ? ` (${o.details.map((d) => `${d.key}: ${d.value}`).join(', ')})` : ''
  switch (o.kind) {
    case 'place': return `${what} → ${path(o.location)}${details}`
    case 'move': return `${what}: ${o.from_location ? `${path(o.from_location)} → ` : 'moved to '}${path(o.location)}${details}`
    case 'remove': return `${what}${details} — gone${o.note ? ` (${o.note})` : ''}`
    case 'lend': return `${what}${details} — lent to ${o.person ?? 'someone'}`
    case 'lost': return `${what}${details} — missing${o.location ? `, last seen ${path(o.location)}` : ''}`
    case 'describe_location': return `${path(o.location)}${o.note ? ` — ${o.note}` : ''}${details}`
    case 'detail': return `${what}${details || (o.note ? ` — ${o.note}` : '')}`
    case 'relate': return `${what} ${o.relation?.replace('_', ' ') ?? 'goes with'} ${o.related_item ?? '?'}`
    case 'correct': return `Correction: ${what}${o.location ? ` → ${path(o.location)}` : ''}${o.note ? ` (${o.note})` : ''}`
    case 'answer': return `${what}${o.location ? ` → ${path(o.location)}` : ''}${details}`
    default: return `${what}${o.location ? ` → ${path(o.location)}` : ''}`
  }
}

export default function Captured({ items }: { items: Obs[] }) {
  if (!items.length) return null
  return (
    <ul className="captured" aria-label="What was recorded">
      {items.map((o, i) => (
        <li key={i} className={o.confidence === 'low' ? 'unsure' : undefined}>
          <span aria-hidden>{ICON[o.kind] ?? '•'}</span> {describe(o)}
          {o.confidence === 'low' && <span className="hint"> · unsure</span>}
        </li>
      ))}
    </ul>
  )
}
