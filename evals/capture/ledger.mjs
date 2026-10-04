// The eval's append-only ledger: evals/capture/ledger.jsonl, committed to git.
// One JSON line per event:
//   {"event":"harness_approved", ...}  who approved which harness fingerprint, when, at which commit
//   {"event":"run", ...}               which code (commit + any uncommitted diff), harness, model,
//                                       cases, scores by set, tokens, and a fingerprint of the results
// Lines are only ever added. verify-ledger.mjs (also the pre-commit hook)
// checks that every committed version is a prefix of the next.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const LEDGER = 'evals/capture/ledger.jsonl'
export const FLOW = '.claude/hillclimb/capture'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

/** The code being tested: commit, and the exact uncommitted diff if any (outside eval output). */
export function codeState() {
  const commit = git('rev-parse', 'HEAD')
  const diff = execFileSync('git', ['diff', 'HEAD', '--', '.', `:(exclude)${FLOW}`, `:(exclude)${LEDGER}`], { encoding: 'utf8' })
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'server', 'src', 'evals')
    .split('\n')
    .filter((f) => f && !f.startsWith('evals/capture/.build'))
  return { commit, dirty: diff.length > 0 || untracked.length > 0, diff, untracked }
}

export function who() {
  const name = (() => { try { return git('config', 'user.name') } catch { return '' } })()
  const email = (() => { try { return git('config', 'user.email') } catch { return '' } })()
  return { git_name: name, git_email: email, os_user: process.env.USER ?? '' }
}

export function harnessSha() {
  try {
    return JSON.parse(readFileSync(join(FLOW, '_state.json'), 'utf8')).harness_sha ?? null
  } catch {
    return null
  }
}

/** Scores and token totals for one variant directory, computed from its files. */
export function summarize(variant) {
  const dir = join(FLOW, variant)
  const resultsPath = join(dir, 'results.jsonl')
  const text = existsSync(resultsPath) ? readFileSync(resultsPath, 'utf8') : ''
  const rows = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
  const errorsPath = join(dir, 'errors.jsonl')
  const errors = existsSync(errorsPath) ? readFileSync(errorsPath, 'utf8').split('\n').filter((l) => l.trim()).length : 0
  const bySet = {}
  let inTok = 0, outTok = 0, cached = 0, personIn = 0, personOut = 0
  for (const r of rows) {
    const set = r.tags?.[0] ?? 'unknown'
    bySet[set] ??= { passed: 0, cases: 0 }
    bySet[set].cases++
    if (r.grade?.pass === 1) bySet[set].passed++
    inTok += r.usage?.input_tokens ?? 0
    outTok += r.usage?.output_tokens ?? 0
    cached += r.usage?.cache_read_input_tokens ?? 0
    personIn += r.judge_usage?.input_tokens ?? 0
    personOut += r.judge_usage?.output_tokens ?? 0
  }
  const passed = rows.filter((r) => r.grade?.pass === 1).length
  return {
    cases: rows.length,
    passed,
    errored_attempts: errors,
    by_set: bySet,
    models: [...new Set(rows.map((r) => r.model).filter(Boolean))],
    person_models: [...new Set(rows.map((r) => r.judge_model).filter(Boolean))],
    tokens: { input: inTok, output: outTok, cached_input: cached, person_input: personIn, person_output: personOut },
    results_file: resultsPath,
    results_sha256: sha256(text),
  }
}

export function append(entry) {
  appendFileSync(LEDGER, JSON.stringify(entry) + '\n')
}

/** Save an uncommitted diff beside a run's results so the run stays reproducible. */
export function saveDiff(variant, state, startedAt) {
  if (!state.dirty) return null
  const name = `uncommitted-${startedAt.replace(/[:.]/g, '-')}.patch`
  const untrackedNote = state.untracked.length ? `# untracked files at run time (contents below):\n${state.untracked.map((f) => `#   ${f}`).join('\n')}\n` : ''
  const untrackedBodies = state.untracked.map((f) => `\n# ===== ${f} =====\n${readFileSync(f, 'utf8')}`).join('')
  const body = `# Code under test was commit ${state.commit} plus this diff.\n${untrackedNote}${state.diff}${untrackedBodies}`
  writeFileSync(join(FLOW, variant, name), body)
  return { file: join(FLOW, variant, name), sha256: sha256(body) }
}

/**
 * Commit exactly these paths (and nothing else that happens to be staged).
 * Runs going in parallel may finish together; git allows one commit at a
 * time, so wait and retry while another commit holds the lock.
 */
export function commitPaths(paths, message) {
  const existing = paths.filter((p) => existsSync(p))
  for (let attempt = 0; ; attempt++) {
    try {
      git('add', '--', ...existing)
      git('commit', '--quiet', '-m', message, '--', ...existing)
      return git('rev-parse', '--short', 'HEAD')
    } catch (e) {
      const locked = /index\.lock|another git process/i.test(String(e?.stderr ?? e?.message ?? e))
      if (!locked || attempt >= 20) throw e
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500 + Math.random() * 1000) // ~1s, jittered
    }
  }
}
