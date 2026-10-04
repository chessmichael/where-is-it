#!/usr/bin/env node
// `npm run eval:capture -- [flags]`: runs the eval with any extra flags
// (e.g. --approve-harness, --variant v1), then:
//   - appends what happened to the ledger (evals/capture/ledger.jsonl):
//     an approval line if the harness fingerprint was (re)approved, and a run line
//   - saves the exact uncommitted diff beside the results, if the code wasn't clean
//   - commits the ledger and the small result files (not the transcripts)
//   - rebuilds cases.html
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { append, codeState, commitPaths, FLOW, harnessSha, LEDGER, saveDiff, summarize, who } from './ledger.mjs'

const extra = process.argv.slice(2)
const flag = (name) => (extra.includes(name) ? extra[extra.indexOf(name) + 1] : undefined)
const variant = flag('--variant') ?? 'baseline'
const model = flag('--model') ?? 'gpt-5.5'

const startedAt = new Date().toISOString()
const code = codeState()
const shaBefore = harnessSha()
const before = summarize(variant)

const run = spawnSync(
  process.execPath,
  ['--env-file=.env', 'evals/capture/run-eval.mjs', '--flow', FLOW, '--model', model, '--concurrency', '6', '--timeout-s', '600', ...extra.filter((a, i) => a !== '--model' && extra[i - 1] !== '--model')],
  { stdio: 'inherit', env: { ...process.env, EVAL_DB_DIR: join(FLOW, variant, 'dbs') } },
)
const finishedAt = new Date().toISOString()
const shaAfter = harnessSha()
if (extra.includes('--approve-harness') && shaAfter && shaAfter !== shaBefore) {
  append({ event: 'harness_approved', at: startedAt, by: who(), harness_sha: shaAfter, previous_harness_sha: shaBefore, git_commit: code.commit, git_dirty: code.dirty })
}
if (run.status === 2) {
  // Refused before running anything (e.g. the harness needs approval). Nothing ran, nothing to record.
  process.exit(2)
}

const after = summarize(variant)
const diff = saveDiff(variant, code, startedAt)
append({
  event: 'run',
  started_at: startedAt,
  finished_at: finishedAt,
  by: who(),
  variant,
  requested_model: model,
  git_commit: code.commit,
  git_dirty: code.dirty,
  uncommitted_diff: diff,
  harness_sha: shaAfter,
  runner_exit: run.status,
  cases_this_run: after.cases - before.cases,
  ...after,
})
const committed = commitPaths(
  [LEDGER, join(FLOW, '_state.json'), join(FLOW, variant, 'results.jsonl'), join(FLOW, variant, 'errors.jsonl'), ...(diff ? [diff.file] : [])],
  `eval run: capture/${variant} ${after.passed}/${after.cases} passed on ${after.models.join(', ') || model}\n\nCode: ${code.commit.slice(0, 12)}${code.dirty ? ' + uncommitted diff (saved with the results)' : ''}\nHarness: ${String(shaAfter).slice(0, 12)}`,
)
console.error(`ledger: recorded run and committed as ${committed}`)
spawnSync(process.execPath, ['scripts/.build/inspect.mjs', '--eval', variant, '--all'], { stdio: 'inherit' })
spawnSync(process.execPath, ['evals/capture/build-viewer.mjs', variant], { stdio: 'inherit' })
process.exit(run.status ?? 1)
