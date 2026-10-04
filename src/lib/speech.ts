// Minimal wrapper around the Web Speech API (SpeechRecognition) plus speech
// synthesis for spoken answers. On iPhone Safari, recognition uses Apple's
// server-side engine, so it needs internet — see the README notes.

type SR = typeof window extends { SpeechRecognition: infer T } ? T : any

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: any) => void) | null
  onerror: ((e: any) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

function getCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null
}

export interface ListenHandlers {
  onInterim?: (text: string) => void
  onFinal: (text: string) => void
  onError?: (err: string) => void
  onEnd?: () => void
  onStart?: () => void
}

export interface Listener {
  stop: () => void // cancel; discard what was heard
  finish: () => void // send what was heard now
  hasText: () => boolean
}

// How long a pause ends an utterance. People pause mid-thought while
// describing a room, so this is generous; tapping the mic sends sooner.
export const SILENCE_MS = 3500

// Dictation that survives pauses. Browsers (iOS Safari especially) end a
// recognition session at the first pause even in continuous mode, so we keep
// restarting it and stitching the text together until there has been
// SILENCE_MS of quiet after the person started talking, or they tap to send.
export function listen(handlers: ListenHandlers): Listener | null {
  const Ctor = getCtor()
  if (!Ctor) {
    handlers.onError?.('unsupported')
    return null
  }
  let committed = '' // text from earlier sessions
  let session = '' // text from the current session (finals + interim)
  let done = false
  let rec: SpeechRecognitionLike | null = null
  let silence: ReturnType<typeof setTimeout> | null = null
  let started = false

  const text = () => `${committed} ${session}`.replace(/\s+/g, ' ').trim()
  const clearSilence = () => {
    if (silence) clearTimeout(silence)
    silence = null
  }
  const end = (send: boolean) => {
    if (done) return
    done = true
    clearSilence()
    try {
      rec?.abort()
    } catch {
      /* already stopped */
    }
    const t = text()
    if (send && t) handlers.onFinal(t)
    handlers.onEnd?.()
  }

  const startSession = () => {
    const r = new Ctor()
    rec = r
    r.lang = 'en-US'
    r.continuous = true
    r.interimResults = true
    r.onstart = () => {
      if (!started) {
        started = true
        handlers.onStart?.()
      }
    }
    r.onresult = (e: any) => {
      let all = ''
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript
      session = all
      handlers.onInterim?.(text())
      clearSilence()
      silence = setTimeout(() => end(true), SILENCE_MS)
    }
    r.onerror = (e: any) => {
      const err = e.error || 'error'
      if (err === 'no-speech' || err === 'aborted') return // onend decides what next
      done = true
      clearSilence()
      handlers.onError?.(err)
    }
    r.onend = () => {
      if (done) return
      // Session ended on its own (a pause, or the platform's time limit).
      committed = text()
      session = ''
      if (!committed) {
        // Never heard anything: report it like the browser's no-speech.
        done = true
        handlers.onError?.('no-speech')
        return
      }
      startSession() // keep listening; the silence timer decides when to send
    }
    try {
      r.start()
    } catch {
      // start() throws if a session is already running; ignore.
    }
  }

  startSession()
  return { stop: () => end(false), finish: () => end(true), hasText: () => text().length > 0 }
}

// iOS only allows speech output that starts from a tap. Speaking a silent
// utterance during the first tap unlocks it for later, automatic replies.
let unlocked = false
export function unlockSpeech(): void {
  if (unlocked || !('speechSynthesis' in window)) return
  unlocked = true
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

// Browsers default to whatever voice the OS lists first, which is often a
// robotic one. Prefer downloaded high-quality voices, then known-good ones.
const PREFERRED = [/premium/i, /enhanced/i, /natural/i, /^(Ava|Zoe|Evan|Nathan|Samantha|Allison|Susan|Tom)\b/i, /Google US English/i]
let chosen: SpeechSynthesisVoice | null | undefined

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosen !== undefined) return chosen
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
  if (voices.length === 0) return null // not loaded yet; try again next time
  const score = (v: SpeechSynthesisVoice) => {
    const i = PREFERRED.findIndex((re) => re.test(v.name))
    return (i === -1 ? 100 : i) + (v.lang === 'en-US' ? 0 : 0.5)
  }
  chosen = [...voices].sort((a, b) => score(a) - score(b))[0] ?? null
  return chosen
}

let voicesReady = false
export function speak(text: string, onEnd?: () => void): void {
  if (!('speechSynthesis' in window)) {
    onEnd?.()
    return
  }
  // Warm up voices on first call (some browsers load them lazily).
  if (!voicesReady) {
    window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', () => (chosen = undefined))
    voicesReady = true
  }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickVoice()
  if (voice) u.voice = voice
  u.rate = 1.0
  u.pitch = 1.0
  if (onEnd) {
    // iOS sometimes never fires onend/onerror; don't let that stall the app.
    let fired = false
    const once = () => {
      if (fired) return
      fired = true
      clearTimeout(guard)
      onEnd()
    }
    const guard = setTimeout(once, 2000 + text.split(/\s+/).length * 450)
    u.onend = once
    u.onerror = once
  }
  window.speechSynthesis.speak(u)
}

export function isSpeaking(): boolean {
  return 'speechSynthesis' in window && window.speechSynthesis.speaking
}

export type { SR }
