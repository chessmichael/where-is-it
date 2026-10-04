// User-configurable settings, persisted locally. The API key never leaves the
// device except in calls the user's own key makes directly to Anthropic.

const KEY_API = 'whi.apiKey'
const KEY_MODEL = 'whi.model'
const KEY_SPEAK = 'whi.speakAnswers'

export type ModelId = 'claude-opus-4-8' | 'claude-sonnet-4-6' | 'claude-haiku-4-5'

export const MODELS: { id: ModelId; label: string; note: string }[] = [
  { id: 'claude-opus-4-8', label: 'Opus 4.8', note: 'Smartest, pricier' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', note: 'Balanced' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'Fastest, cheapest' },
]

export function getApiKey(): string {
  return localStorage.getItem(KEY_API) ?? ''
}
export function setApiKey(key: string): void {
  if (key) localStorage.setItem(KEY_API, key.trim())
  else localStorage.removeItem(KEY_API)
}
export function hasApiKey(): boolean {
  return getApiKey().length > 0
}

export function getModel(): ModelId {
  const m = localStorage.getItem(KEY_MODEL) as ModelId | null
  return m && MODELS.some((x) => x.id === m) ? m : 'claude-opus-4-8'
}
export function setModel(m: ModelId): void {
  localStorage.setItem(KEY_MODEL, m)
}

export function getSpeakAnswers(): boolean {
  return localStorage.getItem(KEY_SPEAK) !== 'false'
}
export function setSpeakAnswers(v: boolean): void {
  localStorage.setItem(KEY_SPEAK, String(v))
}
