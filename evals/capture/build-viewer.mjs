#!/usr/bin/env node
// Builds a readable companion page for the capture eval:
//   .claude/hillclimb/capture/cases.html
// One card per case: what was said, what was expected, each grade with its
// reason, and the conversation as chat bubbles with the agents' actions in
// plain sentences. report.html (from the eval guide's builder) stays the
// official summary; this page is for reading cases.
//
// Everything read from disk is treated as data: every value goes through
// esc(), and the page loads nothing from the network (see the CSP below).
//
//   node evals/capture/build-viewer.mjs [variant]   (default: baseline)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FLOW = join(ROOT, '.claude', 'hillclimb', 'capture')
const variant = process.argv[2] ?? 'baseline'
if (!/^(baseline|v[1-9]\d*)(-[a-z0-9.]+)?$/.test(variant)) throw new Error(`variant must be baseline or vN, got ${variant}`)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const caseFile = JSON.parse(readFileSync(join(ROOT, 'evals', 'capture', 'cases.json'), 'utf8'))
const casesById = new Map(caseFile.cases.map((c) => [c.id, c]))
const state = JSON.parse(readFileSync(join(FLOW, '_state.json'), 'utf8'))
const rows = readFileSync(join(FLOW, variant, 'results.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
const errors = existsSync(join(FLOW, variant, 'errors.jsonl'))
  ? readFileSync(join(FLOW, variant, 'errors.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  : []

const SET_NAMES = {
  empty: 'A · Empty house',
  existing: 'B · Existing places',
  shelving: 'C · Shelving units',
  stack: 'D · Box stacks',
  pantry: 'E · Pantry',
  lookup: 'F · Simple lookups',
  journey: 'G · Lookups after changes',
  groups: 'H · Groups of things',
  duplicates: 'I · Same-named things',
  positional: 'J · Position words',
  spatial: 'K · Picture of the furniture',
}
const METRIC_LABEL = Object.fromEntries(state.metrics.map((m) => [m.id, m.label ?? m.id]))

// ── helpers that turn data into readable sentences ──

const path = (p) => (Array.isArray(p) && p.length ? p.map((s) => (typeof s === 'string' ? s : s.name)).join(' › ') : '')
const alts = (s) => String(s).split('|').join(' / ')

function describeObservation(o) {
  const what = `${o.quantity > 1 ? `${o.quantity} × ` : ''}${o.item ?? 'something'}`
  const details = o.details?.length ? ` (${o.details.map((d) => `${d.key}: ${d.value}`).join(', ')})` : ''
  const note = o.note ? ` — “${o.note}”` : ''
  switch (o.kind) {
    case 'place': return `📍 ${what} → ${path(o.location)}${details}${note}`
    case 'move': return `➡️ ${what}: ${o.from_location ? path(o.from_location) + ' → ' : 'moved to '}${path(o.location)}${note}`
    case 'remove': return `🗑️ ${what} is gone${note}`
    case 'lend': return `🤝 ${what} lent to ${o.person ?? 'someone'}${details}`
    case 'lost': return `❓ ${what} is missing${note}`
    case 'describe_location': return `🗄️ place: ${path(o.location)}${note}`
    case 'detail': return `🏷️ ${what}${details}${note}`
    case 'relate': return `🔗 ${what} ${String(o.relation ?? '').replace('_', ' ')} ${o.related_item ?? ''}`
    case 'correct': return `✏️ correction: ${what} → ${path(o.location)}${note}`
    case 'answer': return `💬 answer: ${what} → ${path(o.location)}${note}`
    default: return `${o.kind}: ${what} ${path(o.location)}`
  }
}

/** A tool call in plain words; returns null for calls not worth a line. */
function describeCall(name, input) {
  switch (name) {
    case 'record_observations': return { title: `Recorded ${input.observations?.length ?? 0} observation(s)`, lines: (input.observations ?? []).map(describeObservation) }
    case 'search_house': return { title: `Searched the house for “${input.query}”` }
    case 'get_location': return { title: `Looked inside “${input.location}”` }
    case 'ask_user': return { title: `Asked: “${input.question}”`, lines: input.options?.length ? [`options: ${input.options.join(' / ')}`] : [] }
    case 'resolve_question': return { title: `Marked question ${input.question_id} ${input.status}` }
    case 'upsert_location': return { title: `Created / confirmed place ${path(input.path)}`, lines: [input.description, input.aliases?.length ? `also called: ${input.aliases.join(', ')}` : null].filter(Boolean) }
    case 'update_location': return { title: `Updated place ${input.location_id}`, lines: [input.name && `name → ${input.name}`, input.description && `description → ${input.description}`].filter(Boolean) }
    case 'upsert_item': {
      const where = input.location_path ? path(input.location_path) : input.location_id ?? input.location_note ?? '(location unchanged)'
      const verb = input.item_id ? 'Updated' : 'Filed new item'
      const extra = [input.quantity && `×${input.quantity}`, input.status && input.status !== 'present' && `status ${input.status}${input.lent_to ? ` to ${input.lent_to}` : ''}`, ...(input.details ?? []).map((d) => `${d.key}: ${d.value}`)].filter(Boolean)
      return { title: `${verb} “${input.name}” → ${where}`, lines: extra.length ? [extra.join(', ')] : [] }
    }
    case 'relate': return { title: `Linked ${input.subject_item_id} ${input.relation} ${input.object_item_id}` }
    case 'merge_items': return { title: `Merged item ${input.remove_id} into ${input.keep_id}` }
    case 'merge_locations': return { title: `Merged place ${input.remove_id} into ${input.keep_id}` }
    case 'get_item': return { title: `Looked up item ${input.item_id}` }
    case 'finish': return { title: 'Finished tidying', lines: [] }
    default: return { title: name }
  }
}

function parseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

// ── rendering ──

function renderTranscript(turns) {
  const out = []
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]
    const who = t.name ?? ''
    if (t.role === 'system') continue // the system prompt is long and the same for every case
    if (t.role === 'tool_result' && who === 'eval') {
      out.push(`<div class="house"><pre>${esc(t.content)}</pre></div>`)
      continue
    }
    if (t.role === 'user' && who === 'eval') {
      out.push(`<div class="divider">${esc(t.content)}</div>`)
      continue
    }
    if (t.role === 'user') {
      const simulated = who.includes('simulated')
      out.push(`<div class="bubble person${simulated ? ' simulated' : ''}"><span class="who">${simulated ? 'Simulated person (answering)' : 'Person'}</span>${esc(t.content)}</div>`)
      continue
    }
    if (t.role === 'assistant' && who.includes('spoken reply')) {
      out.push(`<div class="bubble agent"><span class="who">Agent says</span>${esc(t.content)}</div>`)
      continue
    }
    if (t.role === 'assistant' && who === 'tidy-up agent' && t.content.startsWith('Summary:')) {
      out.push(`<div class="action tidy"><b>Tidy-up summary:</b> ${esc(t.content.slice(8).trim())}</div>`)
      continue
    }
    if (t.role === 'assistant') continue // interim model text duplicates the spoken reply / summary
    if (t.role === 'tool_call') {
      const [agent, tool] = who.split(': ')
      const input = parseJson(t.content) ?? {}
      const result = turns[i + 1]?.role === 'tool_result' ? turns[i + 1] : null
      const failed = result?.content?.startsWith('ERROR:')
      const d = describeCall(tool, input)
      const lines = (d.lines ?? []).map((l) => `<li>${esc(l)}</li>`).join('')
      out.push(
        `<details class="action ${agent.startsWith('tidy') ? 'tidy' : 'conv'}${failed ? ' failed' : ''}"><summary><span class="agent-tag">${esc(agent.startsWith('tidy') ? 'tidy-up' : 'agent')}</span> ${esc(d.title)}${failed ? ' — <b>failed</b>' : ''}</summary>` +
          (lines ? `<ul>${lines}</ul>` : '') +
          `<div class="raw"><div class="label">exact call</div><pre>${esc(t.content)}</pre>${result ? `<div class="label">result</div><pre>${esc(result.content.slice(0, 4000))}</pre>` : ''}</div></details>`,
      )
      if (result) i++
    }
  }
  return out.join('\n')
}

function renderExpected(c) {
  const e = c.expect ?? {}
  const parts = []
  for (const it of e.items ?? []) {
    const bits = [it.path ? `→ ${it.path.map(alts).join(' › ')}` : '', it.quantity ? `×${it.quantity}` : '', it.status ? `status ${it.status}${it.lent_to ? ` to ${it.lent_to}` : ''}` : '', it.details ? Object.entries(it.details).map(([k, v]) => `${k}: ${v}`).join(', ') : '']
    parts.push(`<b>${esc(alts(it.name))}</b> ${esc(bits.filter(Boolean).join(' · '))}`)
  }
  if (typeof e.new_locations === 'number') parts.push(`no more than ${e.new_locations} new place(s)`)
  for (const u of e.units ?? []) parts.push(`unit holding <b>${esc(u.holding)}</b> marked <b>${esc(alts(u.position))}</b>`)
  for (const [a, b] of e.same_unit ?? []) parts.push(`${esc(a)} and ${esc(b)} on the <i>same</i> unit`)
  for (const [a, b] of e.different_unit ?? []) parts.push(`${esc(a)} and ${esc(b)} on <i>different</i> units`)
  if (e.stack) parts.push(`stack top → bottom: ${e.stack.map((s) => `<b>${esc(s)}</b>`).join(' → ')}`)
  if (e.items_keep_their_box) parts.push('every item stays in its own box')
  if (e.answer_mentions_each) parts.push(`reply names both: ${e.answer_mentions_each.map((g) => g.map((m) => `“${esc(alts(m))}”`).join(' + ')).join(' <i>and</i> ')} — or asks which, then names ${e.after_answer_mentions.map((m) => `“${esc(alts(m))}”`).join(' + ')}`)
  if (e.item_counts) parts.push(`count: ${Object.entries(e.item_counts).map(([k, v]) => `${esc(k)} × ${esc(v)}`).join(', ')}`)
  if (e.answer_mentions) parts.push(`reply mentions ${e.answer_mentions.map((m) => `“${esc(alts(m))}”`).join(' + ')}`)
  if (e.answer_not_mentions?.length) parts.push(`reply does <i>not</i> mention ${e.answer_not_mentions.map((m) => `“${esc(alts(m))}”`).join(', ')}`)
  const ask = { must: 'must ask a clarifying question', no: "shouldn't need to ask", either: 'asking is optional' }[c.ask]
  if (ask) parts.push(ask)
  if (c.knows) parts.push(`the simulated person knows: “${esc(c.knows)}”`)
  return parts.map((p) => `<li>${p}</li>`).join('')
}

function renderLines(c) {
  const lines = []
  if (c.set === 'duplicates' || c.set === 'positional') {
    const positions = c.seed_inline?.positions ?? {}
    for (const it of c.seed_inline?.items ?? []) {
      const pos = positions[it.path.join('/')]
      lines.push(['already has', `${it.name} → ${it.path.join(' › ')}${pos ? ` [${pos}]` : ''}`])
    }
  }
  for (const s of c.setup ?? []) lines.push(['earlier', s])
  for (const s of c.steps ?? []) lines.push(s === '<tidy>' ? ['', '🧹 tidy-up'] : ['', s])
  if (c.said) lines.push(['says', c.said])
  if (c.update) lines.push(['then says', c.update])
  if (c.question) lines.push(['asks', c.question])
  return lines.map(([k, v]) => `<li>${k ? `<span class="k">${esc(k)}</span> ` : ''}${v.startsWith('🧹') ? esc(v) : `“${esc(v)}”`}</li>`).join('')
}

function badge(metric, value, why) {
  if (value === null || value === undefined) return ''
  return `<span class="badge ${value === 1 ? 'ok' : 'bad'}" title="${esc(why ?? '')}">${value === 1 ? '✓' : '✗'} ${esc(METRIC_LABEL[metric] ?? metric)}</span>`
}

const suites = existsSync(join(ROOT, 'evals', 'capture', 'suites.json')) ? JSON.parse(readFileSync(join(ROOT, 'evals', 'capture', 'suites.json'), 'utf8')) : null
const suiteOf = (id) => (suites?.capability.includes(id) ? 'capability' : suites?.regression.includes(id) ? 'regression' : null)

// One card per case; repeats (reps) are grouped, with the pass count across them.
const byCase = new Map()
for (const r of rows) byCase.set(r.prompt_id, [...(byCase.get(r.prompt_id) ?? []), r])
const cards = []
const bySet = new Map()
for (const id of [...byCase.keys()].sort()) {
  const reps = byCase.get(id).sort((a, b) => a.rep - b.rep)
  const r = reps[0]
  const c = casesById.get(id) ?? { id, set: r.tags?.[0] }
  const passes = reps.filter((x) => x.grade?.pass === 1).length
  const pass = passes === reps.length
  const s = bySet.get(c.set) ?? { pass: 0, n: 0 }
  s.n += reps.length
  s.pass += passes
  bySet.set(c.set, s)
  const suite = suiteOf(id)
  const shown = reps.find((x) => x.grade?.pass !== 1) ?? r // show a failing rep's details when there is one
  const reasons = Object.entries(shown.explanation ?? {})
    .filter(([k]) => k !== 'pass' && shown.grade?.[k] !== null && shown.grade?.[k] !== undefined)
    .map(([k, v]) => `<li class="${shown.grade[k] === 1 ? 'ok' : 'bad'}"><b>${esc(METRIC_LABEL[k] ?? k)}:</b> ${esc(v)}</li>`)
    .join('')
  const convos = reps
    .map((x) => {
      const tracePath = join(FLOW, variant, 'traces', `${id}_rep${x.rep}.json`)
      const transcript = existsSync(tracePath) ? JSON.parse(readFileSync(tracePath, 'utf8')) : []
      const label = reps.length > 1 ? `Repeat ${x.rep + 1} — ${x.grade?.pass === 1 ? 'passed' : 'failed'}` : 'Show the conversation and what each agent did'
      return `<details class="convo"><summary>${esc(label)}</summary><div class="transcript">${renderTranscript(transcript)}</div>
    <p class="rawlink">Raw transcript file: <code>${esc(`${variant}/traces/${id}_rep${x.rep}.json`)}</code></p></details>`
    })
    .join('')
  cards.push(`
<section class="card ${pass ? 'pass' : 'fail'}" id="${esc(id)}" data-set="${esc(c.set)}" data-pass="${pass ? 1 : 0}" data-passes="${passes}" data-reps="${reps.length}" data-suite="${esc(suite ?? '')}">
  <header>
    <span class="result ${pass ? 'ok' : 'bad'}">${pass ? 'PASS' : 'FAIL'}${reps.length > 1 ? ` ${passes}/${reps.length}` : ''}</span>
    <span class="cid">${esc(id)}</span>
    <span class="set">${esc(SET_NAMES[c.set] ?? c.set)}</span>
    ${suite ? `<span class="tag suite-${esc(suite)}">${esc(suite)}</span>` : ''}
    <span class="tags">${(c.tags ?? []).slice(1).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</span>
    <span class="perf">${esc(Math.round(r.latency_s ?? 0))}s · ${esc(r.agent_calls ?? '?')} model calls · ${esc(r.questions_asked ?? 0)} question(s)</span>
  </header>
  <div class="cols">
    <div><h4>What happens</h4><ul class="lines">${renderLines(c)}</ul></div>
    <div><h4>Expected</h4><ul class="expected">${renderExpected(c)}</ul></div>
  </div>
  <div class="grades">${['database', 'reply', 'observations', 'asking'].map((m) => badge(m, shown.grade?.[m], shown.explanation?.[m])).join(' ')}</div>
  <ul class="reasons">${reasons}</ul>
  ${existsSync(join(FLOW, variant, 'dbs', `${id}.inspect.html`)) ? `<p class="inspect-link"><a href="${esc(`${variant}/dbs/${id}.inspect.html`)}">Inspect this case's final database →</a></p>` : ''}
  ${convos}
</section>`)
}

const total = byCase.size
const passed = [...byCase.values()].filter((reps) => reps.every((x) => x.grade?.pass === 1)).length
const model = rows[0]?.model ?? 'unknown'
const summaryRows = Object.keys(SET_NAMES)
  .filter((k) => bySet.has(k))
  .map((k) => {
    const s = bySet.get(k)
    return `<tr><td>${esc(SET_NAMES[k])}</td><td class="num">${s.pass} / ${s.n}</td><td><div class="bar" title="${s.pass} of ${s.n} runs passed"><div style="width:${Math.round((100 * s.pass) / s.n)}%"></div></div></td></tr>`
  })
  .join('')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Capture Eval Cases</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e0;--ok:#1a7f4b;--ok-bg:#e6f4ec;--bad:#b42318;--bad-bg:#fdecea;--person:#e8f0fe;--agent:#f1f1ef;--tidy:#fff7e6;--sim:#f3e8ff;--code:#f4f4f2}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--ok:#4cc38a;--ok-bg:#15291f;--bad:#f97066;--bad-bg:#2f1714;--person:#1d2a44;--agent:#26262a;--tidy:#2e2716;--sim:#2a1f3d;--code:#17171a}}
:root[data-theme="dark"]{--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--ok:#4cc38a;--ok-bg:#15291f;--bad:#f97066;--bad-bg:#2f1714;--person:#1d2a44;--agent:#26262a;--tidy:#2e2716;--sim:#2a1f3d;--code:#17171a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:24px;margin:0 0 4px}
.sub{color:var(--muted);margin:0 0 20px}
.summary{display:grid;grid-template-columns:auto 1fr;gap:24px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.big{font-size:40px;font-weight:700;line-height:1}
.big small{font-size:15px;font-weight:400;color:var(--muted);display:block;margin-top:6px}
#big-scope{font-size:13px;margin-top:2px}
table{border-collapse:collapse;width:100%}
td{padding:4px 8px;border-bottom:1px solid var(--line)}
td.num{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
.bar{height:8px;background:var(--bad-bg);border-radius:4px;min-width:80px;overflow:hidden}
.bar div{height:100%;background:var(--ok)}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.filters button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}
.filters button.on{background:var(--fg);color:var(--bg)}
.card{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--ok);border-radius:12px;padding:14px 18px;margin:0 0 14px}
.card.fail{border-left-color:var(--bad)}
.card header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.result{font-weight:700;font-size:12px;padding:2px 8px;border-radius:6px}
.result.ok{background:var(--ok-bg);color:var(--ok)}.result.bad{background:var(--bad-bg);color:var(--bad)}
.cid{font-weight:700}.set{color:var(--muted)}
.tag{font-size:12px;background:var(--code);border:1px solid var(--line);border-radius:999px;padding:0 8px;margin-right:4px}
.perf{margin-left:auto;color:var(--muted);font-size:13px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media (max-width:700px){.cols{grid-template-columns:1fr}.perf{margin-left:0}.summary{grid-template-columns:1fr}}
h4{margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
ul{margin:0;padding-left:18px}
.lines .k{color:var(--muted);font-size:13px}
.grades{margin:10px 0 4px;display:flex;flex-wrap:wrap;gap:6px}
.badge{font-size:13px;padding:2px 8px;border-radius:6px}
.badge.ok{background:var(--ok-bg);color:var(--ok)}.badge.bad{background:var(--bad-bg);color:var(--bad)}
.reasons{list-style:none;padding:0;margin:4px 0 0;font-size:14px}
.reasons li{padding:2px 0}.reasons li.bad b{color:var(--bad)}.reasons li.ok b{color:var(--ok)}
details.convo{margin-top:10px}
details.convo>summary{cursor:pointer;color:var(--muted);font-size:14px}
.transcript{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.bubble{max-width:80%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;overflow-wrap:anywhere}
.bubble .who{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:2px}
.bubble.person{align-self:flex-end;background:var(--person)}
.bubble.person.simulated{background:var(--sim)}
.bubble.agent{align-self:flex-start;background:var(--agent)}
.action{font-size:14px;border-left:3px solid var(--line);padding:4px 10px;margin-left:8px}
.action.tidy{background:var(--tidy);border-left-color:#d4a72c;border-radius:0 8px 8px 0}
.action.failed{border-left-color:var(--bad)}
.action summary{cursor:pointer}
.action ul{margin:4px 0}
.agent-tag{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.raw .label{font-size:11px;text-transform:uppercase;color:var(--muted);margin-top:6px}
pre{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:8px 10px;overflow-x:auto;font-size:12.5px;margin:2px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.house pre{background:transparent;border-style:dashed}
.divider{text-align:center;color:var(--muted);font-size:13px;margin:6px 0}
.rawlink{font-size:12px;color:var(--muted)}
.inspect-link{margin:6px 0 0;font-size:14px}
.tag.suite-capability{background:#fef3c7;color:#92400e;border-color:transparent}.tag.suite-regression{background:#e0e7ff;color:#3730a3;border-color:transparent}.inspect-link a{color:inherit}
</style></head>
<body><main>
<h1>Capture eval — case by case</h1>
<p class="sub">${esc(variant)} · model ${esc(model)} · ${total} case(s)${errors.length ? ` · ${errors.length} errored attempt(s) not counted` : ''} · built ${esc(new Date().toLocaleString())}<br>
Each case runs the app's real agents against a throwaway house, then checks the database or the spoken reply. Higher is better. The official summary table is <code>report.html</code> in the same folder.</p>
<div class="summary">
  <div class="big"><span id="big-num">${passed}/${total}</span><small id="big-label">cases passed${rows.length > total ? ' (every repeat)' : ''}</small><small id="big-scope">All cases</small></div>
  <table id="set-bars">${summaryRows}</table>
</div>
<div class="filters" id="filters">
  <button data-f="all" class="on">All</button><button data-f="fail">Failures</button><button data-f="pass">Passes</button>
  ${suites ? '<button data-f="suite:capability">Capability suite</button><button data-f="suite:regression">Regression suite</button>' : ''}
  ${Object.keys(SET_NAMES).filter((k) => bySet.has(k)).map((k) => `<button data-f="set:${esc(k)}">${esc(SET_NAMES[k])}</button>`).join('')}
</div>
${cards.join('\n')}
</main>
<script>
var SET_NAMES = ${JSON.stringify(SET_NAMES).replace(/</g, '\\u003c')};
var SCOPE = { all: 'All cases', fail: 'Failures only', pass: 'Passes only' };
// Rebuild the summary (big number + per-set bars) from the cards currently showing.
function summarize(label) {
  var cards = Array.prototype.filter.call(document.querySelectorAll('.card'), function (c) { return c.style.display !== 'none'; });
  var full = 0, bySet = {};
  cards.forEach(function (c) {
    var passes = +c.dataset.passes, reps = +c.dataset.reps;
    if (passes === reps) full++;
    var s = bySet[c.dataset.set] || (bySet[c.dataset.set] = { pass: 0, n: 0 });
    s.pass += passes; s.n += reps;
  });
  document.getElementById('big-num').textContent = full + '/' + cards.length;
  document.getElementById('big-scope').textContent = label;
  var table = document.getElementById('set-bars');
  table.textContent = '';
  Object.keys(SET_NAMES).forEach(function (k) {
    var s = bySet[k]; if (!s) return;
    var tr = document.createElement('tr');
    var name = document.createElement('td'); name.textContent = SET_NAMES[k];
    var num = document.createElement('td'); num.className = 'num'; num.textContent = s.pass + ' / ' + s.n;
    var cell = document.createElement('td');
    var bar = document.createElement('div'); bar.className = 'bar'; bar.title = s.pass + ' of ' + s.n + ' runs passed';
    var fill = document.createElement('div'); fill.style.width = Math.round(100 * s.pass / s.n) + '%';
    bar.appendChild(fill); cell.appendChild(bar);
    tr.appendChild(name); tr.appendChild(num); tr.appendChild(cell); table.appendChild(tr);
  });
  if (!cards.length) { var tr = document.createElement('tr'); var td = document.createElement('td'); td.textContent = 'No cases match this filter.'; tr.appendChild(td); table.appendChild(tr); }
}
document.getElementById('filters').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#filters button').forEach(function (x) { x.classList.toggle('on', x === b) });
  var f = b.getAttribute('data-f');
  document.querySelectorAll('.card').forEach(function (c) {
    var show = f === 'all' || (f === 'fail' && c.dataset.pass === '0') || (f === 'pass' && c.dataset.pass === '1') || (f.indexOf('set:') === 0 && c.dataset.set === f.slice(4)) || (f.indexOf('suite:') === 0 && c.dataset.suite === f.slice(6));
    c.style.display = show ? '' : 'none';
  });
  summarize(SCOPE[f] || b.textContent);
});
</script>
</body></html>
`
// cases.html is the latest run; cases-<variant>.html keeps each version's page side by side.
writeFileSync(join(FLOW, 'cases.html'), html)
writeFileSync(join(FLOW, `cases-${variant}.html`), html)
console.log(`wrote ${join(FLOW, `cases-${variant}.html`)} (${total} cases, ${passed} passed)`)
