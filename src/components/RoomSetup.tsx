import { useRef, useState } from 'react'
import { buildRoom } from '../lib/claude'
import { mergeRoomDraft, type MergeSummary } from '../lib/model'
import { hasApiKey } from '../lib/settings'
import { isSpeechSupported, listen, type Listener } from '../lib/speech'
import type { RoomDraft } from '../lib/types'

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function RoomSetup({ onClose, onSaved }: Props) {
  const [room, setRoom] = useState('')
  const [narration, setNarration] = useState('')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<RoomDraft | null>(null)
  const [summary, setSummary] = useState<MergeSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const listenerRef = useRef<Listener | null>(null)
  const speechOk = isSpeechSupported()

  function toggleDictation() {
    if (listening) {
      listenerRef.current?.stop()
      listenerRef.current = null
      setListening(false)
      return
    }
    setError(null)
    listenerRef.current = listen({
      onStart: () => setListening(true),
      onFinal: (t) => {
        setNarration((prev) => (prev ? prev + ' ' : '') + t)
      },
      onError: () => setListening(false),
      onEnd: () => {
        setListening(false)
        listenerRef.current = null
      },
    })
  }

  async function build() {
    if (!narration.trim()) return
    if (!hasApiKey()) {
      setError('Building a room needs an Anthropic API key — add one in Settings (⚙).')
      return
    }
    setBusy(true)
    setError(null)
    listenerRef.current?.stop()
    setListening(false)
    try {
      const result = await buildRoom(narration, room.trim() || undefined)
      setBusy(false)
      if (!result) {
        setError('Add an Anthropic API key in Settings (⚙) to build a room.')
        return
      }
      setDraft(result)
    } catch (e: any) {
      setBusy(false)
      const status = e?.status ? ` (HTTP ${e.status})` : ''
      const msg = e?.error?.error?.message || e?.message || String(e)
      setError(`Couldn't build the room${status}: ${msg}`)
    }
  }

  function confirm() {
    if (!draft) return
    const s = mergeRoomDraft(draft)
    setSummary(s)
    setDraft(null)
    onSaved()
  }

  if (summary) {
    return (
      <div className="panel">
        <header className="panel-head">
          <h2>Saved</h2>
          <button className="ghost" onClick={onClose}>
            Done
          </button>
        </header>
        <p className="setup-done">
          {summary.reusedRoom ? 'Updated' : 'Added'} <strong>{summary.roomName}</strong> —{' '}
          {summary.addedItems} item{summary.addedItems === 1 ? '' : 's'} in {summary.addedNodes} spot
          {summary.addedNodes === 1 ? '' : 's'}.
        </p>
        <button
          className="primary wide"
          onClick={() => {
            setSummary(null)
            setRoom('')
            setNarration('')
          }}
        >
          Describe another room
        </button>
      </div>
    )
  }

  if (draft) {
    return (
      <div className="panel">
        <header className="panel-head">
          <h2>Review {draft.room}</h2>
          <button className="ghost" onClick={() => setDraft(null)}>
            Back
          </button>
        </header>
        <p className="hint">Here’s what I understood. Save it to add to your house.</p>
        <div className="draft">
          {draft.items.map((it, i) => (
            <div key={i} className="draft-item">
              <span className="draft-item-name">{it.name}</span>
              <span className="draft-item-loc">{it.locationName}</span>
            </div>
          ))}
        </div>
        <div className="setup-actions">
          <button className="primary" onClick={confirm}>
            Save to {draft.room}
          </button>
          <button className="ghost" onClick={() => setDraft(null)}>
            Discard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h2>Describe a room</h2>
        <button className="ghost" onClick={onClose}>
          Done
        </button>
      </header>
      <p className="hint">
        Name a room, then describe what’s in it — the furniture and what’s on or in each thing.
        Talk naturally; you can dictate or type.
      </p>

      <input
        className="setup-room"
        value={room}
        placeholder="Room (e.g. kitchen, garage)"
        onChange={(e) => setRoom(e.target.value)}
      />

      <textarea
        className="setup-narration"
        value={narration}
        placeholder="e.g. There's a coffee table in the middle — the TV remote and a couple of coasters are on it. Against the wall is the TV stand, and the HDMI cables are in its drawer…"
        rows={7}
        onChange={(e) => setNarration(e.target.value)}
      />

      <div className="setup-actions">
        {speechOk && (
          <button className={listening ? 'ghost listening' : 'ghost'} onClick={toggleDictation}>
            {listening ? '● Listening… tap to stop' : '🎤 Dictate'}
          </button>
        )}
        <button className="primary" onClick={build} disabled={busy || !narration.trim()}>
          {busy ? 'Building…' : 'Build room'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
