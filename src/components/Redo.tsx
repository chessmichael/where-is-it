import { useCallback, useEffect, useState } from 'react'
import { api, type SavedCopy } from '../lib/api'

// "Redo from what I said": re-file one place (and everything in it) or the
// whole house from the original words, with the current agent. A copy of the
// house is saved first; Saved copies lists them for a week, with Restore.

/** A button on a place: redo it from what was said about it. */
export function RedoPlace({ id, name, onDone }: { id: string; name: string; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function run() {
    if (!window.confirm(`Redo ${name} from everything you said about it? A copy of the house is saved first, so you can undo this for a week.`)) return
    setBusy(true)
    try {
      const r = await api.redo(id)
      const asked = r.runs.reduce((n, run) => n + run.questions.length, 0)
      onDone(`Redid ${name} from ${r.entries} thing${r.entries === 1 ? '' : 's'} you said.${asked ? ` It has ${asked} question${asked === 1 ? '' : 's'} for you.` : ''} Saved copies has the before version.`)
    } catch (e) {
      onDone(`Couldn’t redo ${name}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button className="ghost small redo-button" onClick={run} disabled={busy}>
      {busy ? `Redoing ${name}… (about a minute)` : `Redo ${name} from what I said`}
    </button>
  )
}

/** Redo the whole house, and the saved copies to go back to. */
export function SavedCopies({ refreshKey, onChanged }: { refreshKey: unknown; onChanged: (message: string) => void }) {
  const [copies, setCopies] = useState<SavedCopy[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => {
    api.snapshots().then((r) => setCopies(r.snapshots), () => setCopies([]))
  }, [])
  useEffect(load, [load, refreshKey])

  async function redoAll() {
    if (!window.confirm('Rebuild the whole house from everything you’ve ever said? This can take a few minutes. A copy is saved first, so you can undo it for a week.')) return
    setBusy('house')
    try {
      const r = await api.redo(null)
      onChanged(`Rebuilding from ${r.entries} things you said${r.status.pending_compaction ? ' — the rest finishes in the background' : ''}. Saved copies has the before version.`)
    } catch (e) {
      onChanged(`Couldn’t redo the house: ${(e as Error).message}`)
    } finally {
      setBusy(null)
      load()
    }
  }

  async function restore(copy: SavedCopy) {
    if (!window.confirm(`Put the house back as it was: “${copy.label}” (${when(copy.at)})? Anything filed since then is undone too.`)) return
    setBusy(copy.id)
    try {
      await api.restoreSnapshot(copy.id)
      onChanged(`Restored: ${copy.label}.`)
    } catch (e) {
      onChanged(`Couldn’t restore: ${(e as Error).message}`)
    } finally {
      setBusy(null)
      load()
    }
  }

  return (
    <details className="saved-copies">
      <summary>Redo and undo</summary>
      <p className="hint">
        Redo re-reads what you originally said with the latest version of the app — useful after it gets smarter. Open a
        place to redo just that place.
      </p>
      <button className="ghost small" onClick={redoAll} disabled={busy !== null}>
        {busy === 'house' ? 'Rebuilding…' : 'Redo the whole house'}
      </button>
      <h4>Saved copies</h4>
      {copies === null ? (
        <p className="hint">Loading…</p>
      ) : copies.length === 0 ? (
        <p className="hint">None yet. A copy is saved before every redo and kept for a week.</p>
      ) : (
        <ul className="copy-list">
          {copies.map((c) => (
            <li key={c.id}>
              <span>
                {c.label}
                <span className="hint"> · {when(c.at)}</span>
              </span>
              <button className="ghost small" onClick={() => restore(c)} disabled={busy !== null}>
                {busy === c.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
