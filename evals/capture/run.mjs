#!/usr/bin/env node
// `npm run eval:capture -- [flags]`: runs the eval with any extra flags
// (e.g. --approve-harness, --variant v1), then rebuilds cases.html.
import { spawnSync } from 'node:child_process'

const extra = process.argv.slice(2)
const variant = extra[extra.indexOf('--variant') + 1] && extra.includes('--variant') ? extra[extra.indexOf('--variant') + 1] : 'baseline'
const run = spawnSync(
  process.execPath,
  ['--env-file=.env', 'evals/capture/run-eval.mjs', '--flow', '.claude/hillclimb/capture', '--model', 'gpt-5.5', '--concurrency', '6', '--timeout-s', '600', ...extra],
  { stdio: 'inherit' },
)
if (run.status === 2) process.exit(2) // refused before running (e.g. harness not approved) — nothing to show
spawnSync(process.execPath, ['evals/capture/build-viewer.mjs', variant], { stdio: 'inherit' })
process.exit(run.status ?? 1)
