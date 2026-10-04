// Provider-neutral chat-with-tools interface. The agent and its tools only
// speak this shape; adapters in this folder translate to each vendor's API.
// Swap models with LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL — no code changes.

export type JsonSchema = Record<string, unknown>

export interface ToolDef {
  name: string
  description: string
  // Must be "strict-compatible": additionalProperties:false and every property
  // listed in `required` (optional fields are nullable instead). That shape is
  // accepted by both Anthropic and OpenAI strict tool modes.
  parameters: JsonSchema
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResult {
  id: string
  name: string
  content: string
  isError?: boolean
}

export type Msg =
  | { role: 'user'; content: string }
  | {
      role: 'assistant'
      text: string
      toolCalls: ToolCall[]
      // The vendor's native assistant payload, replayed verbatim on the next
      // request to the same provider (e.g. Claude thinking blocks must be
      // passed back unchanged inside a tool loop).
      native?: { provider: string; data: unknown }
    }
  | { role: 'tool'; results: ToolResult[] }

export type Effort = 'low' | 'medium' | 'high'

export interface ChatRequest {
  system: string
  messages: Msg[]
  tools: ToolDef[]
  effort?: Effort
  maxTokens?: number
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'other'

export interface Usage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
}

export interface ChatResponse {
  text: string
  toolCalls: ToolCall[]
  stop: StopReason
  usage: Usage
  model: string
  native: { provider: string; data: unknown }
}

export interface LLMProvider {
  readonly provider: string
  readonly model: string
  chat(req: ChatRequest): Promise<ChatResponse>
}
