import { AwsClient } from 'aws4fetch'
import type { ChatRequest, ChatResponse, LLMProvider, Msg, StopReason } from './types'

// AWS Bedrock's Converse API — one request shape for every Bedrock model with
// tool use (Amazon Nova, Llama, Mistral, DeepSeek, Qwen, gpt-oss, Claude, ...).
// Authenticates with either a Bedrock API key (Authorization: Bearer) or IAM
// access keys (SigV4-signed with aws4fetch, which runs in a Worker as-is).
//
//   LLM_PROVIDER=bedrock  LLM_MODEL=us.amazon.nova-pro-v1:0  AWS_REGION=us-east-1
//   AWS_BEARER_TOKEN_BEDROCK=…   or   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (/ AWS_SESSION_TOKEN)

type Block =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: unknown } }
  | { toolResult: { toolUseId: string; content: { text: string }[]; status: 'success' | 'error' } }
  | Record<string, unknown> // reasoning blocks etc., replayed as-is

interface ConverseMessage {
  role: 'user' | 'assistant'
  content: Block[]
}

export class BedrockError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type BedrockAuth = { apiKey: string } | { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

export class BedrockProvider implements LLMProvider {
  readonly provider = 'bedrock'
  private send: (url: string, init: RequestInit) => Promise<Response>

  constructor(
    auth: BedrockAuth,
    readonly model: string,
    private region = 'us-east-1',
    private timeoutMs = 120_000, // per request; slow reasoning models (Kimi K3) can need longer
  ) {
    if ('apiKey' in auth) {
      this.send = (url, init) => fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${auth.apiKey}` } })
    } else {
      const aws = new AwsClient({ ...auth, service: 'bedrock', region, retries: 0 })
      // Sign, then fetch ourselves: aws4fetch doesn't pass the abort signal on, so a stalled connection would hang forever.
      this.send = async (url, init) => fetch(await aws.sign(url, init), { signal: init.signal })
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(this.model)}/converse`
    const body = {
      system: [{ text: req.system }],
      messages: toConverse(req.messages),
      ...(req.tools.length
        ? { toolConfig: { tools: req.tools.map((t) => ({ toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.parameters } } })) } }
        : {}),
      inferenceConfig: { maxTokens: req.maxTokens ?? 8192 },
    }
    // New accounts get low per-model request quotas: back off and retry on
    // throttling and transient errors instead of failing the turn.
    let res: Response
    for (let attempt = 0; ; attempt++) {
      res = await this.send(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (![429, 500, 502, 503].includes(res.status) || attempt >= 7) break
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** attempt) * (0.5 + Math.random())))
    }
    const text = await res.text()
    if (!res.ok) throw new BedrockError(res.status, `${res.status} Bedrock ${this.model}: ${text.slice(0, 500)}`)
    const data = JSON.parse(text) as {
      output?: { message?: ConverseMessage }
      stopReason?: string
      usage?: { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number }
    }
    const content = data.output?.message?.content ?? []
    const toolCalls: ChatResponse['toolCalls'] = []
    let reply = ''
    for (const b of content) {
      if ('text' in b && typeof b.text === 'string') reply += b.text
      if ('toolUse' in b && b.toolUse) {
        const u = b.toolUse as { toolUseId: string; name: string; input: unknown }
        toolCalls.push({ id: u.toolUseId, name: u.name, input: (u.input ?? {}) as Record<string, unknown> })
      }
    }
    return {
      text: reply,
      toolCalls,
      stop: mapStop(data.stopReason, toolCalls.length > 0),
      usage: {
        inputTokens: data.usage?.inputTokens ?? 0,
        outputTokens: data.usage?.outputTokens ?? 0,
        cachedInputTokens: data.usage?.cacheReadInputTokens ?? 0,
      },
      model: this.model,
      native: { provider: this.provider, data: content },
    }
  }
}

function mapStop(reason: string | undefined, hasTools: boolean): StopReason {
  if (hasTools || reason === 'tool_use') return 'tool_use'
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'end'
  if (reason === 'max_tokens') return 'max_tokens'
  if (reason === 'guardrail_intervened' || reason === 'content_filtered') return 'refusal'
  return 'other'
}

// Converse wants strictly alternating user/assistant turns, with tool results
// inside a user turn — so consecutive same-role messages are merged.
// Bedrock validates every tool call we send back: names must match [a-zA-Z0-9_-]{1,64}. A model
// occasionally garbles a tool name; that turn already got an "unknown tool" result, but replaying
// the garbled name verbatim makes Bedrock reject the whole next request. Replay it under a valid
// placeholder instead, so the model still sees its call failed and can retry.
const VALID_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/
export const safeToolName = (name: string) => (VALID_TOOL_NAME.test(name) ? name : 'invalid_tool_name')
const safeBlock = (b: Block): Block =>
  'toolUse' in b && b.toolUse && typeof b.toolUse === 'object'
    ? { toolUse: { ...(b.toolUse as { toolUseId: string; name: string; input: unknown }), name: safeToolName((b.toolUse as { name: string }).name) } }
    : b

export function toConverse(messages: Msg[]): ConverseMessage[] {
  const out: ConverseMessage[] = []
  const push = (role: ConverseMessage['role'], content: Block[]) => {
    if (!content.length) content = [{ text: '(empty)' }]
    const last = out.at(-1)
    if (last?.role === role) last.content.push(...content)
    else out.push({ role, content })
  }
  for (const m of messages) {
    if (m.role === 'user') push('user', [{ text: m.content }])
    else if (m.role === 'tool')
      push(
        'user',
        m.results.map((r) => ({ toolResult: { toolUseId: r.id, content: [{ text: r.content || '(no output)' }], status: r.isError ? 'error' : 'success' } })),
      )
    else if (m.native?.provider === 'bedrock' && Array.isArray(m.native.data)) push('assistant', (m.native.data as Block[]).map(safeBlock))
    else
      push('assistant', [
        ...(m.text ? [{ text: m.text }] : []),
        ...m.toolCalls.map((c) => ({ toolUse: { toolUseId: c.id, name: safeToolName(c.name), input: c.input } })),
      ])
  }
  return out
}
