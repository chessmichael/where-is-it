#!/usr/bin/env node
// node --env-file=.env scripts/bedrock-check.mjs [model id]
// Lists the text models this Bedrock account offers (with inference profiles),
// then makes one tool call to the given model to prove the key and tool use work.
const key = process.env.AWS_BEARER_TOKEN_BEDROCK
const region = process.env.AWS_REGION || 'us-east-1'
if (!key) throw new Error('set AWS_BEARER_TOKEN_BEDROCK in .env (Bedrock console → API keys)')
const get = async (path) => {
  const r = await fetch(`https://bedrock.${region}.amazonaws.com${path}`, { headers: { authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`${r.status} ${path}: ${(await r.text()).slice(0, 300)}`)
  return r.json()
}
const model = process.argv[2]
if (!model) {
  const { modelSummaries } = await get('/foundation-models?byOutputModality=TEXT')
  const profiles = await get('/inference-profiles?maxResults=1000').catch((e) => ({ inferenceProfileSummaries: [], error: e.message }))
  const byModel = {}
  for (const p of profiles.inferenceProfileSummaries ?? []) for (const m of p.models ?? []) (byModel[m.modelArn.split('/').pop()] ??= []).push(p.inferenceProfileId)
  for (const m of modelSummaries.filter((m) => m.modelLifecycle?.status !== 'LEGACY').sort((a, b) => a.modelId.localeCompare(b.modelId)))
    console.log(`${m.modelId.padEnd(48)} ${(m.inferenceTypesSupported ?? []).join(',').padEnd(26)} ${(byModel[m.modelId] ?? []).join(' ')}`)
  if (profiles.error) console.log('(inference profiles not listed:', profiles.error, ')')
  console.log('\nThen: node --env-file=.env scripts/bedrock-check.mjs <model or profile id>')
} else {
  const r = await fetch(`https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      system: [{ text: 'Record what the user says with the tool.' }],
      messages: [{ role: 'user', content: [{ text: 'the drill is in the garage' }] }],
      toolConfig: { tools: [{ toolSpec: { name: 'record', description: 'Record where an item is.', inputSchema: { json: { type: 'object', additionalProperties: false, required: ['item', 'place'], properties: { item: { type: 'string' }, place: { type: ['string', 'null'] } } } } } }] },
      inferenceConfig: { maxTokens: 512 },
    }),
  })
  const t = await r.text()
  console.log(r.status, t.slice(0, 800))
}
