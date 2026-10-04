import type { ChatResponse, Effort, LLMProvider, Msg, ToolCall, ToolDef } from '../llm/types'

// Provider-neutral tool loop shared by the conversation and compaction agents.
// Each run returns a full trace (every request/response and tool result) so it
// can be saved verbatim and later replayed as eval data.

export interface AgentTool<Ctx> {
  def: ToolDef
  // Return value is JSON-serialized into the tool result. Throw to report an
  // error back to the model (it sees the message and can retry).
  run(input: Record<string, unknown>, ctx: Ctx): unknown | Promise<unknown>
  // When true, the loop stops after this batch of tool calls (e.g. ask_user).
  endsTurn?: boolean
}

export interface TraceStep {
  at: string
  ms: number
  model: string
  stop: ChatResponse['stop']
  usage: ChatResponse['usage']
  text: string
  tool_calls: ToolCall[]
  tool_results: { id: string; name: string; output: unknown; error?: string }[]
}

export interface LoopResult {
  text: string
  stop: ChatResponse['stop'] | 'ended_by_tool' | 'step_limit'
  messages: Msg[]
  steps: TraceStep[]
}

export async function runLoop<Ctx>(opts: {
  llm: LLMProvider
  system: string
  messages: Msg[]
  tools: AgentTool<Ctx>[]
  ctx: Ctx
  effort: Effort
  maxSteps: number
}): Promise<LoopResult> {
  const messages = [...opts.messages]
  const steps: TraceStep[] = []
  const byName = new Map(opts.tools.map((t) => [t.def.name, t]))

  for (let i = 0; i < opts.maxSteps; i++) {
    const t0 = Date.now()
    const res = await opts.llm.chat({
      system: opts.system,
      messages,
      tools: opts.tools.map((t) => t.def),
      effort: opts.effort,
    })
    const step: TraceStep = {
      at: new Date(t0).toISOString(),
      ms: Date.now() - t0,
      model: res.model,
      stop: res.stop,
      usage: res.usage,
      text: res.text,
      tool_calls: res.toolCalls,
      tool_results: [],
    }
    steps.push(step)
    messages.push({ role: 'assistant', text: res.text, toolCalls: res.toolCalls, native: res.native })

    if (res.toolCalls.length === 0 || res.stop === 'max_tokens' || res.stop === 'refusal') {
      return { text: res.text, stop: res.stop, messages, steps }
    }

    let ended = false
    const results = []
    for (const call of res.toolCalls) {
      const tool = byName.get(call.name)
      try {
        if (!tool) throw new Error(`unknown tool ${call.name}`)
        if ('__invalid_json' in call.input) throw new Error('arguments were not valid JSON; call the tool again')
        const output = await tool.run(call.input, opts.ctx)
        if (tool.endsTurn) ended = true
        step.tool_results.push({ id: call.id, name: call.name, output })
        results.push({ id: call.id, name: call.name, content: JSON.stringify(output ?? { ok: true }) })
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        step.tool_results.push({ id: call.id, name: call.name, output: null, error })
        results.push({ id: call.id, name: call.name, content: error, isError: true })
      }
    }
    messages.push({ role: 'tool', results })
    if (ended) return { text: res.text, stop: 'ended_by_tool', messages, steps }
  }
  return { text: '', stop: 'step_limit', messages, steps }
}
