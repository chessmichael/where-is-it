// Which model should play the simulated person? Replays real questions the
// agent asked (taken from saved eval transcripts) to candidate models, then has
// a judge grade each answer against the case's facts. No agent calls.
//
//   npm run eval:audit-person -- [--n 100] [--judge gpt-5.5] gpt-5.4-mini gpt-5.5 bedrock:zai.glm-5 ...
//
// Writes .claude/hillclimb/capture/person-audit.json and prints a table.
// The prompt below mirrors Session.answer in harness.ts — keep them in step.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createProvider } from '../../server/llm'
import type { LLMProvider } from '../../server/llm/types'
import type { Case, CaseFile } from './harness'

const FLOW = '.claude/hillclimb/capture'
const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => (args.includes(name) ? args.splice(args.indexOf(name), 2)[1] : fallback)
const N = Number(opt('--n', '100'))
const JUDGE = opt('--judge', 'gpt-5.5')
const candidates = args.length ? args : ['gpt-5.4-mini', 'gpt-5.5']

interface Sample {
  from: string // variant/trace file
  case: Case
  spoken: string[] // what the person had said before the question
  question: string
  options: string[]
  diagram: string | null
  original: string // what the simulated person said at the time
}

// ── collect real questions ──
const cases = new Map((JSON.parse(readFileSync('evals/capture/cases.json', 'utf8')) as CaseFile).cases.map((c) => [c.id, c]))
const samples: Sample[] = []
for (const variant of readdirSync(FLOW).filter((d) => existsSync(join(FLOW, d, 'traces')))) {
  for (const file of readdirSync(join(FLOW, variant, 'traces'))) {
    const c = cases.get(file.split('_')[0])
    if (!c) continue
    const turns = JSON.parse(readFileSync(join(FLOW, variant, 'traces', file), 'utf8')) as { role: string; name?: string; content: unknown }[]
    const spoken: string[] = []
    let pending: Omit<Sample, 'original' | 'spoken'> | null = null
    for (const t of turns) {
      if (t.role === 'user' && typeof t.content === 'string' && t.name?.startsWith('person')) {
        if (pending) samples.push({ ...pending, spoken: [...spoken], original: t.content })
        pending = null
        spoken.push(t.content)
      } else if (t.role === 'tool_call' && t.name?.endsWith('ask_user')) {
        const input = (typeof t.content === 'string' ? JSON.parse(t.content) : t.content) as { question: string; options?: string[]; diagram?: string | null }
        pending = { from: `${variant}/${file}`, case: c, question: input.question, options: input.options ?? [], diagram: input.diagram ?? null }
      }
    }
  }
}

// Every terse-person and sketch question, then an even spread of the rest.
const priority = samples.filter((s) => s.case.person === 'terse' || s.diagram)
const rest = samples.filter((s) => !priority.includes(s))
const step = Math.max(1, Math.floor(rest.length / Math.max(1, N - priority.length)))
const chosen = [...priority, ...rest.filter((_, i) => i % step === 0)].slice(0, N)
console.error(`${samples.length} questions in transcripts; auditing ${chosen.length} (${priority.length} terse or with a sketch)`)

// ── the simulated person, as in harness.ts ──
function personRequest(s: Sample) {
  const knows = s.case.knows?.trim() || "Nothing specific — you don't remember more than you already said."
  const style =
    s.case.person === 'terse'
      ? 'Answer ONLY the exact question, in as few words as possible ("a different one", "yes", "the left one"). Volunteer nothing else; ' +
        'give a fact only when the question asks for it directly. '
      : 'Like a real person, volunteer the relevant facts you know in the same breath: if you agree to list what is in something, list the items; ' +
        'if you say it is a different shelf, unit or box, also say which one or where it is. '
  return {
    system:
      'You are role-playing a person talking to a home-inventory voice app. The app just asked you a question. ' +
      'Answer briefly and naturally, the way someone would say it out loud, using ONLY the facts below. ' +
      style +
      'Never contradict the facts. Read the question carefully — e.g. "is the one you told me about the left one, or a different one?" — ' +
      'and check your answer against the facts and what you already said before giving it. ' +
      'If the facts don\'t answer the question, say something like "not sure, you decide". ' +
      'If asked whether to list the items in a group individually and the facts don\'t say, answer "no, not this time".\n\n' +
      `Facts you know:\n${knows}\n\nWhat you've said to the app so far:\n${s.spoken.map((t) => `- "${t}"`).join('\n')}`,
    messages: [
      {
        role: 'user' as const,
        content:
          `The app asks: "${s.question}"${s.options.length ? ` (it suggests: ${s.options.join(' / ')})` : ''}` +
          (s.diagram ? `\nIt also shows this sketch on screen — compare it with the facts you know:\n${s.diagram}` : ''),
      },
    ],
    tools: [],
    effort: 'low' as const,
  }
}

const provider = (spec: string): LLMProvider =>
  createProvider({ ...process.env, ...(spec.startsWith('bedrock:') ? { LLM_PROVIDER: 'bedrock', LLM_MODEL: spec.slice(8) } : { LLM_PROVIDER: 'openai', LLM_MODEL: spec }) })

// ── the judge ──
const judge = provider(JUDGE)
async function grade(s: Sample, answer: string) {
  const res = await judge.chat({
    system:
      'You audit a simulated person in an eval. Given the facts the person knows, how they were told to talk, the question they were asked (and any sketch shown), and their answer, judge the answer strictly. Reply with JSON only: ' +
      '{"contradicts": bool (says anything that conflicts with the facts or with what they said earlier), ' +
      '"invents": bool (states a specific fact not in the facts or earlier words, instead of saying they are not sure), ' +
      '"over_volunteers": bool (only for TERSE: adds facts the question did not directly ask for; false for chatty), ' +
      '"answers": bool (actually answers what was asked, or honestly says they are not sure), ' +
      '"sketch_ok": bool|null (null when no sketch; else whether they correctly said if the sketch matches the facts), ' +
      '"why": short string}',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          style: s.case.person === 'terse' ? 'TERSE' : 'chatty',
          facts: s.case.knows ?? '(none)',
          said_earlier: s.spoken,
          question: s.question,
          options: s.options,
          sketch: s.diagram,
          answer,
        }),
      },
    ],
    tools: [],
    effort: 'low',
  })
  try {
    return JSON.parse(res.text.replace(/^```(json)?|```$/g, '').trim())
  } catch {
    return { error: res.text.slice(0, 200) }
  }
}

// ── run (a few at a time) ──
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }))
  return out
}

const results: Record<string, unknown[]> = {}
for (const spec of candidates) {
  const p = provider(spec)
  results[spec] = await pool(chosen, spec.startsWith('bedrock:') ? 3 : 8, async (s) => {
    let answer = ''
    for (let attempt = 0; attempt < 3 && !answer; attempt++) answer = (await p.chat(personRequest(s)).catch((e) => ({ text: `ERROR ${e.message}` }))).text.trim()
    const verdict = answer.startsWith('ERROR') ? { error: answer } : await grade(s, answer).catch((e) => ({ error: String(e.message) }))
    return { from: s.from, case: s.case.id, terse: s.case.person === 'terse', sketch: Boolean(s.diagram), question: s.question, answer, ...verdict }
  })
  console.error(`done: ${spec}`)
}
writeFileSync(join(FLOW, 'person-audit.json'), JSON.stringify({ at: new Date().toISOString(), judge: JUDGE, n: chosen.length, results }, null, 2))

// ── table ──
type V = { contradicts?: boolean; invents?: boolean; over_volunteers?: boolean; answers?: boolean; sketch_ok?: boolean | null; terse: boolean; sketch: boolean; error?: string }
const pct = (xs: V[], f: (v: V) => boolean) => (xs.length ? `${Math.round((100 * xs.filter(f).length) / xs.length)}%` : '-')
console.log(`\nSimulated-person audit (${chosen.length} real agent questions; judge ${JUDGE})`)
console.log(['model'.padEnd(28), 'contradicts', 'invents', 'over-volunteers (terse)', 'answers', 'sketch ok', 'errors'].join('  '))
for (const [spec, rows] of Object.entries(results) as [string, V[]][]) {
  const ok = rows.filter((r) => !r.error)
  console.log(
    [
      spec.padEnd(28),
      pct(ok, (r) => !!r.contradicts).padStart(11),
      pct(ok, (r) => !!r.invents).padStart(7),
      pct(ok.filter((r) => r.terse), (r) => !!r.over_volunteers).padStart(23),
      pct(ok, (r) => !!r.answers).padStart(7),
      pct(ok.filter((r) => r.sketch), (r) => r.sketch_ok === true).padStart(9),
      String(rows.length - ok.length).padStart(6),
    ].join('  '),
  )
}
