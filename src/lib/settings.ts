// Per-device preferences. Everything else (data, model choice) lives on the server.

const KEY_SPEAK = 'whi.speakAnswers'

export function getSpeakAnswers(): boolean {
  return localStorage.getItem(KEY_SPEAK) !== 'false'
}
export function setSpeakAnswers(v: boolean): void {
  localStorage.setItem(KEY_SPEAK, String(v))
}
