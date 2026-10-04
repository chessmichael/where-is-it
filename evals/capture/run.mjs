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
//
// Afterwards: appends approval/run lines to evals/capture/ledger.jsonl, saves any uncommitted
// diff beside the results, commits the ledger and the small result files, builds an inspector
// page per case, and rebuilds cases.html.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { append, codeState, commitPaths, FLOW, harnessSha, LEDGER, saveDiff, sha256, summarize, who } from './ledger.mjs'

const extra = process.argv.slice(2)
const flag = (name) => (extra.includes(name) ? extra[extra.indexOf(name) + 1] : undefined)
const variant = flag('--variant') ?? 'baseline'
const model = flag('--model') ?? 'gpt-5.5'
const codeCommit = flag('--code')
const rerun = flag('--rerun')
const reason = flag('--reason') ?? 'grader or harness fix'
const passThrough = []
for (let i = 0; i < extra.length; i++) {
  if (['--model', '--code', '--rerun', '--reason'].includes(extra[i])) { i++; continue }
  passThrough.push(extra[i])
}
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim()
const startedAt = new Date().toISOString()
const code = codeState()
const shaBefore = harnessSha()
const env = { ...process.env, EVAL_DB_DIR: join(FLOW, variant, 'dbs') }
const archived = []

// ── --rerun: move the chosen rows out (kept in archive/, recorded in the ledger) ──
if (rerun) {
  const cases = JSON.parse(readFileSync('evals/capture/cases.json', 'utf8')).cases
  const ids = new Set(
    rerun === 'all'
      ? cases.map((c) => c.id)
      : rerun.split(',').flatMap((t) => (t.startsWith('set:') ? cases.filter((c) => c.id.startsWith(t.slice(4))).map((c) => c.id) : [t.trim()])),
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
  env.EVAL_ONLY = [...ids].join(',')
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

const run = spawnSync(
  process.execPath,
  ['--env-file=.env', 'evals/capture/run-eval.mjs', '--flow', FLOW, '--model', model, '--concurrency', '6', '--timeout-s', '600', ...passThrough],
  { stdio: 'inherit', env },
)
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
  git_commit: agentCommit,
  ...(codeCommit ? { agent_code_from: agentCommit, harness_from: code.commit } : {}),
  git_dirty: code.dirty,
  uncommitted_diff: diff,
  harness_sha: shaAfter,
  runner_exit: run.status,
  ...(rerun ? { rerun: env.EVAL_ONLY.split(','), reason } : {}),
  ...after,
})
const committed = commitPaths(
  [LEDGER, join(FLOW, '_state.json'), join(FLOW, variant, 'results.jsonl'), join(FLOW, variant, 'errors.jsonl'), ...archived, ...(diff ? [diff.file] : [])],
  `eval run: capture/${variant} ${after.passed}/${after.cases} passed on ${after.models.join(', ') || model}${rerun ? ` (re-ran ${env.EVAL_ONLY.split(',').length} case(s))` : ''}\n\nAgent code: ${agentCommit.slice(0, 12)}${codeCommit ? ` (harness from ${code.commit.slice(0, 12)})` : code.dirty ? ' + uncommitted diff (saved with the results)' : ''}\nHarness: ${String(shaAfter).slice(0, 12)}${rerun ? `\nRe-run because: ${reason}` : ''}`,
)
console.error(`ledger: recorded run and committed as ${committed}`)
spawnSync(process.execPath, ['scripts/.build/inspect.mjs', '--eval', variant, '--all'], { stdio: 'inherit' })
spawnSync(process.execPath, ['evals/capture/build-viewer.mjs', variant], { stdio: 'inherit' })
process.exit(run.status ?? 1)
