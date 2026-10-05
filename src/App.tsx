import { useCallback, useEffect, useRef, useState } from 'react'
import { api, enqueue, flushOutbox, isOfflineError, queued, type AgentQuestion, type Captured as Obs, type Me } from './lib/api'
import { legacyUtterances, clearLegacy } from './lib/legacy'
import { getInputMode, getSpeakAnswers, setInputMode, type InputMode } from './lib/settings'
import { isSpeechSupported, listen, speak, unlockSpeech, type Listener } from './lib/speech'
import Captured from './components/Captured'
import Files from './components/Files'
import HouseExplorer from './components/HouseExplorer'
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
  const wide = useWide()
  const [me, setMe] = useState<Me | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  const refreshMe = useCallback(() => {
    api.me().then(setMe, (e) => setBootError(String(e.message ?? e)))
  }, [])
  useEffect(refreshMe, [refreshMe])

  if (bootError) return <p className="error boot">Can't reach the server: {bootError}</p>
  if (!me) return <p className="hint boot">Loading…</p>
  if (!me.account) return <SignIn me={me} onSignedIn={refreshMe} />
  const signOut = () => api.signOut().finally(refreshMe)
  return wide ? <Desktop me={me} onSignOut={signOut} /> : <Main me={me} onSignOut={signOut} />
}

/** True on screens wide enough for the computer layout (a sidebar and two panes). */
function useWide(): boolean {
  const query = '(min-width: 900px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const m = window.matchMedia(query)
    const onChange = () => setWide(m.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])
  return wide
}

type DesktopView = 'house' | 'inspect' | 'files' | 'talk' | 'settings'

/**
 * The computer layout: a sidebar and wide panes, for looking through and
 * pulling down what was captured on the phone. Opens on House.
 */
function Desktop({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [view, setView] = useState<DesktopView>('house')
  const nav: [DesktopView, string, string][] = [
    ['house', 'House', 'Browse and find everything'],
    ['inspect', 'Inspect', 'Health checks and each item’s history'],
    ['files', 'Files', 'Download your data'],
    ['talk', 'Talk', 'Add or ask by typing or speaking'],
  ]
  return (
    <div className="desk">
      <aside className="desk-side">
        <div className="desk-brand">Where Is It</div>
        <nav aria-label="Sections">
          {nav.map(([v, label, hint]) => (
            <button key={v} className={view === v ? 'desk-nav current' : 'desk-nav'} aria-current={view === v} onClick={() => setView(v)}>
              <span className="menu-label">{label}</span>
              <span className="menu-hint">{hint}</span>
            </button>
          ))}
        </nav>
        <div className="desk-foot">
          <button className={view === 'settings' ? 'desk-nav current' : 'desk-nav'} onClick={() => setView('settings')}>
            <span className="menu-label">Settings</span>
            <span className="menu-hint">Signed in as {me.account?.name}</span>
          </button>
        </div>
      </aside>
      <main className={`desk-main desk-${view}`}>
        {view === 'house' && <HouseExplorer />}
        {view === 'inspect' && <iframe className="inspector" src="/api/inspect" sandbox="" title="House inspector" />}
        {view === 'files' && (
          <div className="desk-column">
            <h1 className="desk-title">Files</h1>
            <Files />
          </div>
        )}
        {view === 'talk' && (
          <div className="desk-talk">
            <Main me={me} onSignOut={onSignOut} embedded />
          </div>
        )}
        {view === 'settings' && (
          <div className="desk-column">
            <Settings me={me} onClose={() => setView('house')} onSignOut={onSignOut} />
          </div>
        )}
      </main>
    </div>
  )
}

function Main({ me, onSignOut, embedded = false }: { me: Me; onSignOut: () => void; embedded?: boolean }) {
  const [status, setStatus] = useState<Status>('idle')
  const [interim, setInterim] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('main')
  const [typed, setTyped] = useState('')
  const [loop, setLoop] = useState(true)
  const [pendingOffline, setPendingOffline] = useState(queued().length)
  const [legacy, setLegacy] = useState(() => legacyUtterances())
  // On a computer (embedded in the wide layout) typing is the default; the phone remembers your choice.
  const [mode, setMode] = useState<InputMode>(() => (!isSpeechSupported() ? 'type' : embedded ? 'type' : getInputMode()))
  const [menuOpen, setMenuOpen] = useState(false)

  const listenerRef = useRef<Listener | null>(null)
  const loopRef = useRef(loop)
  loopRef.current = loop
  const viewRef = useRef(view)
  viewRef.current = view
  const conversation = useRef({ id: newConversationId(), last: Date.now() })
  const transcriptEnd = useRef<HTMLDivElement>(null)
  const speechOk = isSpeechSupported()

  const add = useCallback((l: Line) => setLines((ls) => [...ls, l]), [])
  // Keep the newest line in view — including what you're saying right now.
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [lines, interim, status])

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
    if (speechOk && mode === 'voice') startListening()
    else setLoop(false)
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
    if (mode === 'voice' && loop && speechOk) startListening()
  }

  async function importLegacy() {
    stopListening()
    setLoop(false)
    for (const u of legacy) await process(u)
    clearLegacy()
    setLegacy([])
  }

  const lastQuestion = [...lines].reverse().find((l) => l.who === 'agent')?.question

  function chooseMode(next: InputMode) {
    setMode(next)
    if (!embedded) setInputMode(next)
    if (next === 'type') {
      setLoop(false)
      stopListening()
    } else if (speechOk) {
      setLoop(true)
      startListening()
    }
  }

  const VIEW_TITLES: Record<View, string> = { main: 'Where Is It', house: 'House', inspect: 'Inspect', files: 'Files', settings: 'Settings' }

  return (
    <div className={embedded ? 'app embedded' : 'app'}>
      {!embedded && (
      <header className="topbar">
        <button className="icon-button" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <span className="hamburger" aria-hidden />
        </button>
        <h1 className="title">{VIEW_TITLES[view]}</h1>
        <button className={view === 'settings' ? 'icon-button active' : 'icon-button'} aria-label="Settings" onClick={() => open('settings')}>
          ⚙
        </button>
        {menuOpen && (
          <>
            <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
            <nav className="menu" aria-label="Sections">
              {(
                [
                  ['main', 'Talk', 'Tell it where things are, or ask'],
                  ['house', 'House', 'Everything filed, room by room'],
                  ['inspect', 'Inspect', 'Health checks and each item’s history'],
                  ['files', 'Files', 'Download your data'],
                ] as [View, string, string][]
              ).map(([v, label, hint]) => (
                <button
                  key={v}
                  className={view === v ? 'menu-item current' : 'menu-item'}
                  onClick={() => {
                    setMenuOpen(false)
                    if (v === 'main') goMain()
                    else if (view !== v) open(v)
                  }}
                >
                  <span className="menu-label">{label}</span>
                  <span className="menu-hint">{hint}</span>
                </button>
              ))}
            </nav>
          </>
        )}
      </header>
      )}

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
            {lines.length === 0 && !interim && (
              <p className="hint transcript-empty">
                Say where something is — “the extension cords are in the blue bin on the top garage shelf” — or ask
                “where’s my passport?”
              </p>
            )}
            {lines.map((l, i) => (
              <div key={i} className={`turn ${l.who}`}>
                <p className={`line ${l.who}`}>{l.text}</p>
                {l.question?.diagram && <pre className="diagram" aria-label="Sketch with this question">{l.question.diagram}</pre>}
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
            {/* What you're saying right now, as the newest line of the conversation. */}
            {interim && (
              <div className="turn you">
                <p className="line you live" aria-live="polite">
                  {interim}
                </p>
              </div>
            )}
            {status === 'thinking' && <p className="line agent thinking">…</p>}
            <div ref={transcriptEnd} />
          </div>

          <div className="dock">
            {pendingOffline > 0 && <p className="hint">{pendingOffline} waiting to send (offline)</p>}
            {legacy.length > 0 && (
              <button className="ghost setup-cta" onClick={importLegacy} disabled={status === 'thinking'}>
                Bring in what you saved in the old version of the app
              </button>
            )}
            {error && <p className="error">{error}</p>}

            {mode === 'voice' ? (
              <div className="voice-row">
                <p className="status-line">
                  {status === 'listening' && (interim ? 'Pause, or tap to send' : 'Listening…')}
                  {status === 'thinking' && 'Thinking…'}
                  {status === 'speaking' && 'Tap to skip'}
                  {status === 'idle' && (speechOk ? 'Tap to talk' : 'Voice isn’t available here — switch to Type')}
                </p>
                <button
                  className={`mic ${status}`}
                  onClick={toggleMic}
                  disabled={status === 'thinking' || !speechOk}
                  aria-label={status === 'listening' ? (interim ? 'Send' : 'Stop listening') : 'Start listening'}
                >
                  <span className="mic-glyph" aria-hidden>
                    {status === 'thinking' ? '…' : status === 'listening' && interim ? '➤' : '🎤'}
                  </span>
                  {status === 'listening' && <span className="pulse" />}
                </button>
              </div>
            ) : (
              <form className="typebar" onSubmit={submitTyped}>
                <input
                  value={typed}
                  autoFocus
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder="Where something is, or a question"
                  aria-label="Type a statement or question"
                />
                <button className="primary" type="submit" disabled={!typed.trim() || status === 'thinking'}>
                  Send
                </button>
              </form>
            )}

            <div className="mode-switch" role="tablist" aria-label="How to talk to it">
              <button role="tab" aria-selected={mode === 'voice'} className={mode === 'voice' ? 'on' : ''} onClick={() => chooseMode('voice')}>
                Voice
              </button>
              <button role="tab" aria-selected={mode === 'type'} className={mode === 'type' ? 'on' : ''} onClick={() => chooseMode('type')}>
                Type
              </button>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}
