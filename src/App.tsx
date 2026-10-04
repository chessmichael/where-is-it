import { useCallback, useEffect, useRef, useState } from 'react'
import { handleInput, type EngineResult } from './lib/engine'
import { getItems, getRooms } from './lib/model'
import { getSpeakAnswers } from './lib/settings'
import { isSpeechSupported, listen, speak, type Listener } from './lib/speech'
import HouseTree from './components/HouseTree'
import RoomSetup from './components/RoomSetup'
import Settings from './components/Settings'

type Status = 'idle' | 'listening' | 'thinking'
type View = 'main' | 'house' | 'setup' | 'settings'

export default function App() {
  const [status, setStatus] = useState<Status>('idle')
  const [interim, setInterim] = useState('')
  const [result, setResult] = useState<EngineResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('main')
  const [typed, setTyped] = useState('')
  const [loop, setLoop] = useState(true)
  const [, setTick] = useState(0) // force re-read of the model after changes

  const listenerRef = useRef<Listener | null>(null)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const speechOk = isSpeechSupported()

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const itemCount = getItems().length
  const hasHouse = getRooms().length > 0 || itemCount > 0

  const stopListening = useCallback(() => {
    listenerRef.current?.stop()
    listenerRef.current = null
    setStatus('idle')
  }, [])

  const process = useCallback(async (text: string) => {
    const clean = text.trim()
    if (!clean) return
    setStatus('thinking')
    setInterim('')
    setError(null)
    try {
      const res = await handleInput(clean)
      setResult(res)
      setTick((t) => t + 1)
      const restart = () => {
        if (loopRef.current && view === 'main') startListening()
        else setStatus('idle')
      }
      if (res.kind === 'answer' && getSpeakAnswers()) speak(res.spoken, restart)
      else restart()
    } catch (e) {
      setError(String(e))
      setStatus('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  const startListening = useCallback(() => {
    if (!speechOk) return
    setError(null)
    setResult(null)
    setInterim('')
    listenerRef.current = listen({
      onStart: () => setStatus('listening'),
      onInterim: (t) => setInterim(t),
      onFinal: (t) => {
        listenerRef.current = null
        process(t)
      },
      onError: (err) => {
        listenerRef.current = null
        if (err === 'no-speech') {
          if (loopRef.current && view === 'main') startListening()
          else setStatus('idle')
          return
        }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          setError('Microphone access was blocked. Enable it in your browser settings.')
          setLoop(false)
        } else if (err === 'unsupported') {
          setError('Voice input is not supported in this browser. You can still type.')
        }
        setStatus('idle')
      },
      onEnd: () => {
        if (!listenerRef.current && status === 'listening') setStatus('idle')
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechOk, process, view])

  useEffect(() => {
    if (speechOk && view === 'main') startListening()
    return () => stopListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleMic() {
    if (status === 'listening') {
      setLoop(false)
      stopListening()
    } else {
      setLoop(true)
      startListening()
    }
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault()
    if (!typed.trim()) return
    setLoop(false)
    stopListening()
    process(typed)
    setTyped('')
  }

  function goMain() {
    setView('main')
    if (loop && speechOk) startListening()
  }

  const highlightId =
    result?.kind === 'added'
      ? result.item.id
      : result?.kind === 'answer' && result.matches[0]
        ? result.matches[0].id
        : undefined

  return (
    <div className="app">
      <header className="topbar">
        <button
          className={view === 'house' ? 'tab active' : 'tab'}
          onClick={() => (view === 'house' ? goMain() : (stopListening(), setView('house')))}
        >
          House {itemCount > 0 && <span className="count">{itemCount}</span>}
        </button>
        <h1 className="title">Where Is It</h1>
        <button
          className={view === 'settings' ? 'tab active' : 'tab'}
          onClick={() => (view === 'settings' ? goMain() : (stopListening(), setView('settings')))}
        >
          ⚙
        </button>
      </header>

      {view === 'settings' && <Settings onClose={goMain} onChanged={refresh} />}
      {view === 'setup' && <RoomSetup onClose={() => setView('house')} onSaved={refresh} />}

      {view === 'house' && (
        <div className="panel">
          <div className="house-actions">
            <button className="primary" onClick={() => (stopListening(), setView('setup'))}>
              ＋ Describe a room
            </button>
          </div>
          <HouseTree highlightId={highlightId} onChange={refresh} />
        </div>
      )}

      {view === 'main' && (
        <main className="main">
          <div className="stage">
            <button
              className={`mic ${status}`}
              onClick={toggleMic}
              disabled={status === 'thinking'}
              aria-label={status === 'listening' ? 'Stop listening' : 'Start listening'}
            >
              <span className="mic-glyph">{status === 'thinking' ? '…' : '🎤'}</span>
              {status === 'listening' && <span className="pulse" />}
            </button>

            <p className="status-line">
              {status === 'listening' && 'Listening… say where something is, or ask where it is.'}
              {status === 'thinking' && 'Thinking…'}
              {status === 'idle' && (speechOk ? 'Tap the mic to talk.' : 'Type below.')}
            </p>

            {interim && <p className="interim">“{interim}”</p>}

            {result && (
              <div className={`result ${result.kind}`}>
                <p className="result-text">{result.spoken}</p>
                {result.kind === 'answer' && result.matches.length > 1 && (
                  <ul className="result-matches">
                    {result.matches.map((m) => (
                      <li key={m.id}>{m.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {error && <p className="error">{error}</p>}

            {!hasHouse && !result && (
              <button className="ghost setup-cta" onClick={() => (stopListening(), setView('setup'))}>
                Set up your house →
              </button>
            )}
          </div>

          <form className="typebar" onSubmit={submitTyped}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder='e.g. "where is my phone charger?"'
              aria-label="Type an item or question"
            />
            <button className="primary" type="submit">
              Send
            </button>
          </form>
        </main>
      )}
    </div>
  )
}
