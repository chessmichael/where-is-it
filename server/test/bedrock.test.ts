import { describe, expect, it } from 'vitest'
import { toConverse } from '../llm/bedrock'

describe('Bedrock replay of tool calls', () => {
  it('replays a garbled tool name under a valid placeholder, so Bedrock accepts the next request', () => {
    const garbled = 'upsert_item<|tool_sep|>{"name":' // outside [a-zA-Z0-9_-]
    const long = 'x'.repeat(70)
    const out = toConverse([
      { role: 'user', content: 'hi' },
      { role: 'assistant', text: '', toolCalls: [], native: { provider: 'bedrock', data: [{ toolUse: { toolUseId: 't1', name: garbled, input: {} } }, { toolUse: { toolUseId: 't2', name: 'finish', input: {} } }] } },
      { role: 'tool', results: [{ id: 't1', name: garbled, content: 'unknown tool', isError: true }, { id: 't2', name: 'finish', content: 'ok' }] },
      { role: 'assistant', text: '', toolCalls: [{ id: 't3', name: long, input: {} }] },
    ])
    const names = out.flatMap((m) => m.content).flatMap((b) => ('toolUse' in b && b.toolUse ? [(b.toolUse as { name: string }).name] : []))
    expect(names).toEqual(['invalid_tool_name', 'finish', 'invalid_tool_name'])
    // The failed call's result still pairs with it by id.
    expect(JSON.stringify(out)).toContain('"toolUseId":"t1"')
  })
})
