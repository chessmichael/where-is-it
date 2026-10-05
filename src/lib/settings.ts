// Per-device preferences. Everything else (data, model choice) lives on the server.

const KEY_SPEAK = 'whi.speakAnswers'

export function getSpeakAnswers(): boolean {
  return localStorage.getItem(KEY_SPEAK) !== 'false'
}
export function setSpeakAnswers(v: boolean): void {
  localStorage.setItem(KEY_SPEAK, String(v))
}

const KEY_MODE = 'whi.inputMode'
export type InputMode = 'voice' | 'type'

export function getInputMode(): InputMode {
  return localStorage.getItem(KEY_MODE) === 'type' ? 'type' : 'voice'
}
export function setInputMode(m: InputMode): void {
  localStorage.setItem(KEY_MODE, m)
}
