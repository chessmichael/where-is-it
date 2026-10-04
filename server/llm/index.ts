import { AnthropicProvider } from './anthropic'
import { OpenAIProvider } from './openai'
import type { LLMProvider } from './types'

export type { LLMProvider } from './types'

export interface LLMEnv {
  LLM_PROVIDER?: string
  LLM_MODEL?: string
  LLM_BASE_URL?: string
  LLM_API_KEY?: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5.5',
}

// Builds the configured provider. LLM_API_KEY overrides the vendor-specific
// key, which is how keyed OpenAI-compatible hosts (OpenRouter, Gemini) work.
export function createProvider(env: LLMEnv): LLMProvider {
  const provider = (env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')).toLowerCase()
  const model = env.LLM_MODEL || DEFAULT_MODEL[provider]
  const baseURL = env.LLM_BASE_URL || undefined
  if (!(provider in DEFAULT_MODEL)) throw new Error(`Unknown LLM_PROVIDER "${provider}" (use "anthropic" or "openai")`)
  if (!model) throw new Error(`LLM_MODEL is required for provider "${provider}"`)

  switch (provider) {
    case 'anthropic': {
      const key = env.LLM_API_KEY || env.ANTHROPIC_API_KEY
      if (!key) throw new Error('ANTHROPIC_API_KEY (or LLM_API_KEY) is not set')
      return new AnthropicProvider(key, model, baseURL)
    }
    case 'openai': {
      const key = env.LLM_API_KEY || env.OPENAI_API_KEY || ''
      // Local hosts like Ollama need no key; api.openai.com does.
      if (!key && !baseURL) throw new Error('OPENAI_API_KEY (or LLM_API_KEY) is not set')
      return new OpenAIProvider(key, model, baseURL)
    }
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}" (use "anthropic" or "openai")`)
  }
}
