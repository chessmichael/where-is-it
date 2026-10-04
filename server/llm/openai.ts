import OpenAI from 'openai'
import type { ChatRequest, ChatResponse, LLMProvider, Msg, StopReason } from './types'

// OpenAI Chat Completions — also the de-facto API of most other hosts
// (Ollama, OpenRouter, Gemini's OpenAI endpoint, vLLM, LM Studio, ...), so
// pointing LLM_BASE_URL elsewhere is how "any other model" plugs in.

export class OpenAIProvider implements LLMProvider {
  readonly provider = 'openai'
  private client: OpenAI
  // Optional request features some models/hosts reject. Each is dropped
  // (and remembered) the first time a 400 comes back with it set.
  private supports = { reasoningEffort: true, strict: true }

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
  ) {
    // Bounded so one slow call can't hang a turn; the app shows an error instead.
    this.client = new OpenAI({ apiKey: apiKey || 'not-needed', baseURL: baseURL || undefined, timeout: 60_000, maxRetries: 1 })
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    for (;;) {
      try {
        return await this.once(req)
      } catch (e) {
        if (!(e instanceof OpenAI.BadRequestError)) throw e
        if (this.supports.reasoningEffort && req.effort) this.supports.reasoningEffort = false
        else if (this.supports.strict) this.supports.strict = false
        else throw e
      }
    }
  }

  private async once(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'system', content: req.system }, ...toOpenAI(req.messages)],
      tools: req.tools.length === 0 ? undefined : req.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          ...(this.supports.strict ? { strict: true } : {}),
        },
      })),
      ...(this.supports.reasoningEffort && req.effort ? { reasoning_effort: req.effort } : {}),
    })

    const choice = res.choices[0]
    const msg = choice?.message
    const toolCalls: ChatResponse['toolCalls'] = []
    for (const c of msg?.tool_calls ?? []) {
      if (c.type !== 'function') continue
      let input: Record<string, unknown> = {}
      try {
        input = JSON.parse(c.function.arguments || '{}')
      } catch {
        input = { __invalid_json: c.function.arguments }
      }
      toolCalls.push({ id: c.id, name: c.function.name, input })
    }
    return {
      text: msg?.content ?? '',
      toolCalls,
      stop: mapStop(choice?.finish_reason, toolCalls.length > 0, Boolean(msg?.refusal)),
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
        cachedInputTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      },
      model: res.model,
      native: { provider: this.provider, data: msg },
    }
  }
}

function mapStop(reason: string | undefined, hasTools: boolean, refused: boolean): StopReason {
  if (refused) return 'refusal'
  if (hasTools || reason === 'tool_calls') return 'tool_use'
  if (reason === 'stop') return 'end'
  if (reason === 'length') return 'max_tokens'
  if (reason === 'content_filter') return 'refusal'
  return 'other'
}

function toOpenAI(messages: Msg[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = []
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'tool') {
      for (const r of m.results) {
        out.push({ role: 'tool', tool_call_id: r.id, content: r.isError ? `ERROR: ${r.content}` : r.content })
      }
    } else {
      out.push({
        role: 'assistant',
        content: m.text || null,
        ...(m.toolCalls.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.input) },
              })),
            }
          : {}),
      })
    }
  }
  return out
}
