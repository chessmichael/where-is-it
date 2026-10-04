import Anthropic from '@anthropic-ai/sdk'
import type { ChatRequest, ChatResponse, LLMProvider, Msg, StopReason } from './types'

// Claude models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = /^claude-(opus-5|opus-5-5|sonnet-5-5|fable-5-1)$/

export class AnthropicProvider implements LLMProvider {
  readonly provider = 'anthropic'
  private client: Anthropic

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
  ) {
    // Bounded so one slow call can't hang a turn; the app shows an error instead.
    this.client = new Anthropic({ apiKey, baseURL: baseURL || undefined, timeout: 60_000, maxRetries: 1 })
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const fallback = FALLBACK_MODELS.test(this.model)
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      // Auto-cache the stable prefix (tools + system + earlier turns).
      cache_control: { type: 'ephemeral' },
      system: req.system,
      tools: req.tools.length === 0 ? undefined : req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
        strict: true,
      })),
      messages: toAnthropic(req.messages, this.provider),
      ...(req.effort ? { output_config: { effort: req.effort } } : {}),
      ...(fallback
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    })

    let text = ''
    const toolCalls: ChatResponse['toolCalls'] = []
    for (const b of res.content) {
      if (b.type === 'text') text += b.text
      else if (b.type === 'tool_use') {
        toolCalls.push({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> })
      }
    }
    return {
      text,
      toolCalls,
      stop: mapStop(res.stop_reason),
      usage: {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        cachedInputTokens: res.usage.cache_read_input_tokens ?? 0,
      },
      model: res.model,
      native: { provider: this.provider, data: res.content },
    }
  }
}

function mapStop(s: string | null): StopReason {
  switch (s) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end'
    case 'tool_use':
      return 'tool_use'
    case 'max_tokens':
      return 'max_tokens'
    case 'refusal':
      return 'refusal'
    default:
      return 'other'
  }
}

function toAnthropic(messages: Msg[], provider: string): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m): Anthropic.Beta.BetaMessageParam => {
    if (m.role === 'user') return { role: 'user', content: m.content }
    if (m.role === 'tool') {
      return {
        role: 'user',
        content: m.results.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      }
    }
    // Replay our own native content unchanged (keeps thinking blocks valid).
    if (m.native?.provider === provider) {
      return { role: 'assistant', content: m.native.data as Anthropic.Beta.BetaContentBlockParam[] }
    }
    const content: Anthropic.Beta.BetaContentBlockParam[] = []
    if (m.text) content.push({ type: 'text', text: m.text })
    for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.input })
    return { role: 'assistant', content }
  })
}
