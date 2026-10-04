import { useCallback, useEffect, useRef, useState } from 'react'
import { api, enqueue, flushOutbox, isOfflineError, queued, type AgentQuestion, type Captured as Obs, type Me } from './lib/api'
import { legacyUtterances, clearLegacy } from './lib/legacy'
import { getSpeakAnswers } from './lib/settings'
import { isSpeechSupported, listen, speak, unlockSpeech, type Listener } from './lib/speech'
import Captured from './components/Captured'
import Files from './components/Files'
import HouseTree from './components/HouseTree'
import Settings from './components/Settings'
import SignIn from './components/SignIn'

type Status = 'idle' | 'listening' | 'thinking' | 'speaking'
type View = 'main' | 'house' | 'inspect' | 'files' | 'settings'

interface Line {
  who: 'you' | 'agent' | 'system'
  text: string
  question?: AgentQuestion | null
  captured?: Obs[]
}

// A conversation is a run of exchanges; a long pause starts a new one so
// traces stay readable and the agent's short-term context stays relevant.
const CONVERSATION_IDLE_MS = 20 * 60_000
const newConversationId = () => `c_${new Date().toISOString().slice(0, 10)}_${Math.random().toString(36).slice(2, 8)}`

export default function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  const refreshMe = useCallback(() => {
    api.me().then(setMe, (e) => setBootError(String(e.message ?? e)))
  }, [])
  useEffect(refreshMe, [refreshMe])

  if (bootError) return <p className="error boot">Can't reach the server: {bootError}</p>
  if (!me) return <p className="hint boot">Loading…</p>
  if (!me.account) return <SignIn me={me} onSignedIn={refreshMe} />
  return <Main me={me} onSignOut={() => api.signOut().finally(refreshMe)} />
}

function Main({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [status, setStatus] = useState<Status>('idle')
  const [interim, setInterim] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('main')
  const [typed, setTyped] = useState('')
  const [loop, setLoop] = useState(true)
  const [pendingOffline, setPendingOffline] = useState(queued().length)
  const [legacy, setLegacy] = useState(() => legacyUtterances())

  const listenerRef = useRef<Listener | null>(null)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const viewRef = useRef(view)
  viewRef.current = view
  const conversation = useRef({ id: newConversationId(), last: Date.now() })
  const transcriptEnd = useRef<HTMLDivElement>(null)
  const speechOk = isSpeechSupported()

  const add = useCallback((l: Line) => setLines((ls) => [...ls, l]), [])
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const conversationId = () => {
    const c = conversation.current
    if (Date.now() - c.last > CONVERSATION_IDLE_MS) c.id = newConversationId()
    c.last = Date.now()
    return c.id
  }

  const stopListening = useCallback(() => {
    listenerRef.current?.stop()
    listenerRef.current = null
    setStatus('idle')
  }, [])

  const startListeningRef = useRef<() => void>(() => {})

  const afterReply = useCallback((spoken: string | null) => {
    const restart = () => {
      if (loopRef.current && viewRef.current === 'main') startListeningRef.current()
      else setStatus('idle')
    }
    // Leave "thinking" as soon as the answer is in, whether or not speech plays.
    if (spoken && getSpeakAnswers()) {
      setStatus('speaking')
      speak(spoken, restart)
    } else restart()
  }, [])

  const process = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean) return
      setStatus('thinking')
      setInterim('')
      setError(null)
      add({ who: 'you', text: clean })
      const cid = conversationId()
      try {
        const r = await api.converse(cid, clean)
        add({ who: 'agent', text: r.reply, question: r.question, captured: r.observations })
        afterReply(r.reply)
      } catch (e) {
        if (isOfflineError(e)) {
          enqueue({ conversationId: cid, text: clean, at: new Date().toISOString() })
          setPendingOffline(queued().length)
          add({ who: 'system', text: "You're offline. Saved on this phone; it'll be sent when you're back online." })
        } else {
          setError(e instanceof Error ? e.message : String(e))
        }
        setStatus('idle')
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [add, afterReply],
  )

  const startListening = useCallback(() => {
    if (!speechOk) return
    setError(null)
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
          if (loopRef.current && viewRef.current === 'main') startListeningRef.current()
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
        if (!listenerRef.current) setStatus((s) => (s === 'listening' ? 'idle' : s))
      },
    })
  }, [speechOk, process])
  startListeningRef.current = startListening

  // Unlock spoken replies on the first tap (iOS requires a user gesture).
  useEffect(() => {
    window.addEventListener('pointerdown', unlockSpeech, { once: true })
    return () => window.removeEventListener('pointerdown', unlockSpeech)
  }, [])

  useEffect(() => {
    if (speechOk) startListening()
    return () => stopListening()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Send anything queued while offline.
  useEffect(() => {
    const flush = () =>
      flushOutbox((q, r) => {
        add({ who: 'you', text: q.text })
        add({ who: 'agent', text: r.reply, question: r.question, captured: r.observations })
      }).then(() => setPendingOffline(queued().length))
    flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [add])

  function toggleMic() {
    if (status === 'speaking') {
      window.speechSynthesis?.cancel() // the speak() guard then restarts listening
      return
    }
    if (status === 'listening') {
      // Tap while talking = send now; tap with nothing heard = stop listening.
      if (listenerRef.current?.hasText()) return listenerRef.current.finish()
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

  function answer(option: string) {
    stopListening()
    process(option)
  }

  function open(v: View) {
    if (view === v) return goMain()
    stopListening()
    setView(v)
  }

  function goMain() {
    setView('main')
    if (loop && speechOk) startListening()
  }

  async function importLegacy() {
    stopListening()
    setLoop(false)
    for (const u of legacy) await process(u)
    clearLegacy()
    setLegacy([])
  }

  const lastQuestion = [...lines].reverse().find((l) => l.who === 'agent')?.question

  return (
    <div className="app">
      <header className="topbar">
        <button className={view === 'house' ? 'tab active' : 'tab'} onClick={() => open('house')}>
          House
        </button>
        <button className={view === 'inspect' ? 'tab active' : 'tab'} onClick={() => open('inspect')}>
          Inspect
        </button>
        <button className={view === 'files' ? 'tab active' : 'tab'} onClick={() => open('files')}>
          Files
        </button>
        <h1 className="title">Where Is It</h1>
        <button className={view === 'settings' ? 'tab active' : 'tab'} onClick={() => open('settings')}>
          ⚙
        </button>
      </header>

      {view === 'settings' && <Settings me={me} onClose={goMain} onSignOut={onSignOut} />}

      {view === 'house' && (
        <div className="panel">
          <HouseTree />
        </div>
      )}

      {view === 'inspect' && (
        <div className="panel inspect-panel">
          {/* Sandboxed with no permissions: the page has no scripts and can't navigate the app. */}
          <iframe className="inspector" src="/api/inspect" sandbox="" title="House inspector" />
        </div>
      )}

      {view === 'files' && (
        <div className="panel">
          <Files />
        </div>
      )}

      {view === 'main' && (
        <main className="main">
          <div className="transcript">
            {lines.length === 0 && (
              <p className="hint transcript-empty">
                Say where something is — “the extension cords are in the blue bin on the top garage shelf” — or ask
                “where’s my passport?”
              </p>
            )}
            {lines.map((l, i) => (
              <div key={i} className={`turn ${l.who}`}>
                <p className={`line ${l.who}`}>{l.text}</p>
                {l.captured && <Captured items={l.captured} />}
              </div>
            ))}
            {lastQuestion && lastQuestion.options.length > 0 && status !== 'thinking' && (
              <div className="options">
                {lastQuestion.options.map((o) => (
                  <button key={o} className="ghost option" onClick={() => answer(o)}>
                    {o}
                  </button>
                ))}
              </div>
            )}
            {interim && <p className="line you interim">“{interim}”</p>}
            <div ref={transcriptEnd} />
          </div>

          <div className="stage">
            <button
              className={`mic ${status}`}
              onClick={toggleMic}
              disabled={status === 'thinking'}
              aria-label={status === 'listening' ? (interim ? 'Send' : 'Stop listening') : 'Start listening'}
            >
              <span className="mic-glyph">{status === 'thinking' ? '…' : status === 'listening' && interim ? '➤' : '🎤'}</span>
              {status === 'listening' && <span className="pulse" />}
            </button>
            <p className="status-line">
              {status === 'listening' && (interim ? 'Pause for a moment or tap the mic to send.' : 'Listening…')}
              {status === 'thinking' && 'Thinking…'}
              {status === 'speaking' && 'Tap the mic to skip.'}
              {status === 'idle' && (speechOk ? 'Tap the mic to talk.' : 'Type below.')}
            </p>
            {pendingOffline > 0 && <p className="hint">{pendingOffline} waiting to send (offline)</p>}
            {legacy.length > 0 && (
              <button className="ghost setup-cta" onClick={importLegacy} disabled={status === 'thinking'}>
                Import {legacy.length} {legacy.length === 1 ? 'room' : 'rooms'} saved on this phone by the old version →
              </button>
            )}
            {error && <p className="error">{error}</p>}
          </div>

          <form className="typebar" onSubmit={submitTyped}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder='e.g. "where is my phone charger?"'
              aria-label="Type a statement or question"
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
