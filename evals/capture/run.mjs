#!/usr/bin/env node
// `npm run eval:capture -- [flags]`: runs the eval, then records and commits it.
//
//   --variant v3                 which variant directory (default: baseline)
//   --approve-harness            approve a changed harness (yours to pass)
//   --code <commit>              run that commit's AGENT code under today's harness — e.g. re-run
//                                v1's cases after a grader fix, with v1's own prompts and tools
//   --rerun <ids|set:D|all>      supersede these cases' existing rows (archived, noted in the ledger)
//                                and run them again; "set:D" means every case in set D
//   --reason "…"                 why rows are being re-run (goes in the ledger)
//   --suite capability|regression|all  which cases (see suites.json / make_suites.py). With no
//                                --suite, --only or --rerun, the CAPABILITY suite runs: the cases
//                                that still tell versions apart. Use regression before a deploy.
//   --only <ids|set:X>           run (or resume) only these cases, keeping their existing rows
//   --reps N                     up to N repeats per case (existing reps are reused). ADAPTIVE: every
//                                case runs once; only cases whose result differs from the reference
//                                version (or that were flaky or unrun there) get the other N-1
//   --against <variant>          the reference for --reps (default: the latest earlier variant)
//   --full-reps                  run all N repeats for every case (no adaptive skipping)
//   --effort low|medium|high     override the reasoning effort the agents ask for (EVAL_EFFORT)
//   --concurrency N              cases at a time (default 10 on OpenAI, 3 on Bedrock's lower quotas)
//   --fast-model <model>         route short, plain turns to this cheaper model (as LLM_FAST_MODEL does in
//                                the app); everything else, and all of tidy-up, uses --model
//   --no-open                    don't open the results page in the browser afterwards
//
// Afterwards: appends approval/run lines to evals/capture/ledger.jsonl, saves any uncommitted
// diff beside the results, commits the ledger and the small result files, builds an inspector
// page per case, and rebuilds cases.html.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { append, codeState, commitPaths, FLOW, harnessSha, LEDGER, saveDiff, sha256, summarize, who } from './ledger.mjs'

const extra = process.argv.slice(2)
const flag = (name) => (extra.includes(name) ? extra[extra.indexOf(name) + 1] : undefined)
const variant = flag('--variant') ?? 'baseline'
const model = flag('--model') ?? 'gpt-5.5'
const codeCommit = flag('--code')
const rerun = flag('--rerun')
const reason = flag('--reason') ?? 'grader or harness fix'
const suite = flag('--suite') ?? (flag('--only') || flag('--rerun') ? undefined : 'capability')
const reps = Number(flag('--reps') ?? 1)
const only = flag('--only')
const passThrough = []
for (let i = 0; i < extra.length; i++) {
  if (['--model', '--code', '--rerun', '--reason', '--suite', '--only', '--reps', '--against', '--fast-model', '--concurrency', '--effort'].includes(extra[i])) { i++; continue }
  if (['--no-open', '--full-reps'].includes(extra[i])) continue
  passThrough.push(extra[i])
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
const startedAt = new Date().toISOString()
const code = codeState()
const shaBefore = harnessSha()
const env = { ...process.env, EVAL_DB_DIR: join(FLOW, variant, 'dbs') }
const fastModel = flag('--fast-model')
if (fastModel) env.EVAL_FAST_MODEL = fastModel
if (flag('--effort')) env.EVAL_EFFORT = flag('--effort')
// --model bedrock:<id>: borrow the AWS CLI's credentials (kept in memory only) unless a Bedrock key is set.
if ([model, fastModel ?? ''].some((m) => m.startsWith('bedrock:')) && !env.AWS_BEARER_TOKEN_BEDROCK && !env.AWS_ACCESS_KEY_ID) {
  const c = JSON.parse(execFileSync('aws', ['configure', 'export-credentials', '--format', 'process'], { encoding: 'utf8' }))
  Object.assign(env, { AWS_ACCESS_KEY_ID: c.AccessKeyId, AWS_SECRET_ACCESS_KEY: c.SecretAccessKey, ...(c.SessionToken ? { AWS_SESSION_TOKEN: c.SessionToken } : {}) })
  env.AWS_REGION ??= execFileSync('aws', ['configure', 'get', 'region'], { encoding: 'utf8' }).trim() || 'us-east-1'
}
const archived = []

// ── suites: record a new or changed split once in the ledger; --suite narrows the run ──
const suitesText = existsSync('evals/capture/suites.json') ? readFileSync('evals/capture/suites.json', 'utf8') : null
if (suitesText) {
  const suites = JSON.parse(suitesText)
  const lastDefined = readFileSync(LEDGER, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.event === 'suites_defined').at(-1)
  if (lastDefined?.suites_sha256 !== sha256(suitesText)) {
    append({ event: 'suites_defined', at: startedAt, by: who(), suites_sha256: sha256(suitesText), rule: suites.rule, regression: suites.regression.length, capability: suites.capability.length, by_set: suites.by_set, computed_from: suites.computed_from })
  }
  if (suite === 'all') {
    // Every dev case. Robustness copies (--suite robustness) and the held-out test set (--suite test) run only when asked for.
    env.EVAL_ONLY = JSON.parse(readFileSync('evals/capture/cases.json', 'utf8')).cases.filter((c) => !c.split).map((c) => c.id).join(',')
  } else if (suite) {
    if (!suites[suite]) throw new Error(`--suite must be one of: regression, capability, robustness, test, test-hard, all`)
    env.EVAL_ONLY = suites[suite].join(',')
  }
} else if (suite && suite !== 'all') throw new Error('no evals/capture/suites.json yet — run make_suites.py')

// ── --only: narrow the run to some cases without touching their existing rows ──
const expand = (spec) => {
  const cases = JSON.parse(readFileSync('evals/capture/cases.json', 'utf8')).cases
  return spec === 'all'
    ? cases.map((c) => c.id)
    : spec.split(',').flatMap((t) => (t.startsWith('set:') ? cases.filter((c) => c.id.startsWith(t.slice(4))).map((c) => c.id) : [t.trim()]))
}
if (only) {
  const ids = expand(only)
  env.EVAL_ONLY = (env.EVAL_ONLY ? env.EVAL_ONLY.split(',').filter((id) => ids.includes(id)) : ids).join(',')
}

// ── --rerun: move the chosen rows out (kept in archive/, recorded in the ledger) ──
if (rerun) {
  const cases = JSON.parse(readFileSync('evals/capture/cases.json', 'utf8')).cases
  const inSuite = env.EVAL_ONLY ? new Set(env.EVAL_ONLY.split(',')) : null // --suite narrows what's re-run
  const ids = new Set(
    (rerun === 'all'
      ? cases.map((c) => c.id)
      : rerun.split(',').flatMap((t) => (t.startsWith('set:') ? cases.filter((c) => c.id.startsWith(t.slice(4))).map((c) => c.id) : [t.trim()]))
    ).filter((id) => !inSuite || inSuite.has(id)),
  )
  for (const file of ['results.jsonl', 'errors.jsonl']) {
    const path = join(FLOW, variant, file)
    if (!existsSync(path)) continue
    const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim())
    const out = lines.filter((l) => ids.has(JSON.parse(l).prompt_id))
    if (!out.length) continue
    mkdirSync(join(FLOW, 'archive'), { recursive: true })
    const dest = join(FLOW, 'archive', `${variant}-superseded-${startedAt.replace(/[:.]/g, '-')}-${file}`)
    writeFileSync(dest, out.join('\n') + '\n')
    writeFileSync(path, lines.filter((l) => !ids.has(JSON.parse(l).prompt_id)).map((l) => l + '\n').join(''))
    archived.push(dest)
    append({ event: 'superseded', at: startedAt, by: who(), variant, file, case_ids: [...new Set(out.map((l) => JSON.parse(l).prompt_id))], rows: out.length, reason, archived_to: dest, archived_sha256: sha256(out.join('\n') + '\n') })
  }
  env.EVAL_ONLY = env.EVAL_ONLY ? env.EVAL_ONLY.split(',').filter((id) => ids.has(id)).join(',') : [...ids].join(',')
}

// ── --code: build the harness against that commit's agent code ──
let agentCommit = code.commit
if (codeCommit) {
  agentCommit = git('rev-parse', codeCommit)
  const tree = join('.claude', 'worktrees', agentCommit.slice(0, 12))
  if (!existsSync(tree)) git('worktree', 'add', '--detach', tree, agentCommit)
  // Today's harness, compiled against that commit's server/ code.
  mkdirSync(join(tree, 'evals', 'capture'), { recursive: true })
  writeFileSync(join(tree, 'evals', 'capture', 'harness.ts'), readFileSync('evals/capture/harness.ts'))
  const bundle = join('evals', 'capture', '.build', `harness-${agentCommit.slice(0, 12)}.mjs`)
  execFileSync('node_modules/.bin/esbuild', [join(tree, 'evals', 'capture', 'harness.ts'), '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--packages=external', '--log-level=warning'])
  env.EVAL_HARNESS_BUNDLE = join(process.cwd(), bundle)
}

const runEval = (n, only) =>
  spawnSync(
    process.execPath,
    ['--env-file=.env', 'evals/capture/run-eval.mjs', '--flow', FLOW, '--model', model, '--concurrency', flag('--concurrency') ?? (model.startsWith('bedrock:') ? '3' : '10'), '--timeout-s', '600', '--reps', String(n), ...passThrough],
    { stdio: 'inherit', env: only ? { ...env, EVAL_ONLY: only.join(',') } : env },
  )

// ── adaptive repeats: one pass of everything, then repeats only where they can change a verdict ──
const passes = (v) => {
  const path = join(FLOW, v, 'results.jsonl')
  const by = {}
  if (existsSync(path)) for (const l of readFileSync(path, 'utf8').split('\n')) if (l.trim()) { const r = JSON.parse(l); (by[r.prompt_id] ??= []).push(r.grade.pass === 1) }
  return by
}
const against =
  flag('--against') ??
  readdirSync(FLOW)
    .filter((d) => existsSync(join(FLOW, d, 'results.jsonl')) && d !== variant && d !== 'archive')
    .filter((d) => /^(baseline|v\d+)$/.test(d))
    .sort((a, b) => (a === 'baseline' ? -1 : b === 'baseline' ? 1 : Number(a.slice(1)) - Number(b.slice(1))))
    .filter((d) => variant.startsWith('baseline') ? false : d === 'baseline' || Number(d.slice(1)) < parseInt(variant.slice(1)))
    .at(-1)
let run = runEval(1)
let adaptive
if (reps > 1 && run.status !== 2) {
  const ids = env.EVAL_ONLY ? env.EVAL_ONLY.split(',') : JSON.parse(readFileSync('evals/capture/cases.json', 'utf8')).cases.map((c) => c.id)
  const mine = passes(variant)
  const ref = against ? passes(against) : {}
  const repeat = extra.includes('--full-reps')
    ? ids
    : ids.filter((id) => {
        const before = ref[id]
        if (!before?.length || !mine[id]?.length) return true // nothing to compare against
        if (before.some((p) => p !== before[0])) return true // flaky there: needs repeats here too
        return mine[id].some((p) => p !== before[0]) // differs from the reference
      })
  adaptive = { against: against ?? null, cases: ids.length, repeated: repeat.length, skipped: ids.length - repeat.length }
  console.error(`adaptive reps: ${repeat.length} of ${ids.length} case(s) differ from ${against ?? '(no reference)'} or were flaky there — repeating those to ${reps}`)
  if (repeat.length) run = runEval(reps, repeat)
}
const finishedAt = new Date().toISOString()
const shaAfter = harnessSha()
if (extra.includes('--approve-harness') && shaAfter && shaAfter !== shaBefore) {
  append({ event: 'harness_approved', at: startedAt, by: who(), harness_sha: shaAfter, previous_harness_sha: shaBefore, git_commit: code.commit, git_dirty: code.dirty })
}
if (run.status === 2) process.exit(2) // refused before running anything (e.g. harness not approved)

const after = summarize(variant)
const diff = saveDiff(variant, code, startedAt)
append({
  event: 'run',
  started_at: startedAt,
  finished_at: finishedAt,
  by: who(),
  variant,
  requested_model: model,
  ...(fastModel ? { fast_model: fastModel } : {}),
  ...(flag('--effort') ? { effort: flag('--effort') } : {}),
  git_commit: agentCommit,
  ...(codeCommit ? { agent_code_from: agentCommit, harness_from: code.commit } : {}),
  git_dirty: code.dirty,
  uncommitted_diff: diff,
  harness_sha: shaAfter,
  runner_exit: run.status,
  ...(rerun ? { rerun: env.EVAL_ONLY.split(','), reason } : {}),
  ...(suite ? { suite } : {}),
  ...(only ? { only } : {}),
  ...(flag('--reps') ? { reps } : {}),
  ...(adaptive ? { adaptive } : {}),
  ...after,
})
const committed = commitPaths(
  [LEDGER, 'evals/capture/suites.json', join(FLOW, '_state.json'), join(FLOW, variant, 'results.jsonl'), join(FLOW, variant, 'errors.jsonl'), ...archived, ...(diff ? [diff.file] : [])],
  `eval run: capture/${variant}${suite ? ` [${suite}]` : ''} ${after.passed}/${after.cases} passed on ${after.models.join(', ') || model}${rerun ? ` (re-ran ${env.EVAL_ONLY.split(',').length} case(s))` : ''}\n\nAgent code: ${agentCommit.slice(0, 12)}${codeCommit ? ` (harness from ${code.commit.slice(0, 12)})` : code.dirty ? ' + uncommitted diff (saved with the results)' : ''}\nHarness: ${String(shaAfter).slice(0, 12)}${rerun ? `\nRe-run because: ${reason}` : ''}`,
)
console.error(`ledger: recorded run and committed as ${committed}`)
spawnSync(process.execPath, ['scripts/.build/inspect.mjs', '--eval', variant, '--all'], { stdio: 'inherit' })
spawnSync(process.execPath, ['evals/capture/build-viewer.mjs', variant], { stdio: 'inherit' })
spawnSync(process.execPath, ['evals/capture/build-compare.mjs'], { stdio: 'inherit' })
// Show the version-by-version comparison (it links to each version's case pages); --no-open to skip.
if (!extra.includes('--no-open') && process.platform === 'darwin') spawnSync('open', [join(FLOW, 'compare.html')])
process.exit(run.status ?? 1)
