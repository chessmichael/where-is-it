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
  stop: () => void
}

export function listen(handlers: ListenHandlers): Listener | null {
  const Ctor = getCtor()
  if (!Ctor) {
    handlers.onError?.('unsupported')
    return null
  }
  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.continuous = false
  rec.interimResults = true

  rec.onstart = () => handlers.onStart?.()
  rec.onresult = (e: any) => {
    let interim = ''
    let final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += r[0].transcript
      else interim += r[0].transcript
    }
    if (interim) handlers.onInterim?.(interim)
    if (final) handlers.onFinal(final)
  }
  rec.onerror = (e: any) => handlers.onError?.(e.error || 'error')
  rec.onend = () => handlers.onEnd?.()

  try {
    rec.start()
  } catch {
    // start() throws if already running; ignore.
  }
  return { stop: () => rec.abort() }
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
    voicesReady = true
  }
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1.0
  u.pitch = 1.0
  if (onEnd) {
    u.onend = onEnd
    u.onerror = onEnd
  }
  window.speechSynthesis.speak(u)
}

export function isSpeaking(): boolean {
  return 'speechSynthesis' in window && window.speechSynthesis.speaking
}

export type { SR }
