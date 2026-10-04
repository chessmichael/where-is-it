#!/usr/bin/env node
// Checks the eval ledger is append-only: every committed version of
// evals/capture/ledger.jsonl must start with the full previous version, and
// the staged / working copy must start with the last committed one.
//   node evals/capture/verify-ledger.mjs           whole history + working copy
//   node evals/capture/verify-ledger.mjs --staged  just HEAD → staged (pre-commit hook)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const LEDGER = 'evals/capture/ledger.jsonl'
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const show = (rev) => { try { return git('show', `${rev}:${LEDGER}`) } catch { return null } }

const problems = []
function check(older, newer, label) {
  if (older === null || newer === null) return
  if (!newer.startsWith(older)) problems.push(`${label}: lines were changed or removed (the ledger may only grow)`)
  for (const [i, line] of newer.split('\n').entries()) {
    if (!line.trim()) continue
    try { JSON.parse(line) } catch { problems.push(`${label}: line ${i + 1} isn't valid JSON`) }
  }
}

if (process.argv.includes('--staged')) {
  check(show('HEAD'), show(''), 'staged ledger vs HEAD')
} else {
  const revs = git('log', '--format=%H', '--reverse', '--', LEDGER).split('\n').filter(Boolean)
  for (let i = 1; i < revs.length; i++) check(show(revs[i - 1]), show(revs[i]), `commit ${revs[i].slice(0, 12)}`)
  if (existsSync(LEDGER)) check(show('HEAD'), readFileSync(LEDGER, 'utf8'), 'working copy vs HEAD')
  console.log(`checked ${revs.length} committed version(s) of ${LEDGER}`)
}
if (problems.length) {
  console.error('✗ ledger is not append-only:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log('✓ ledger is append-only')
