#!/usr/bin/env node
// Builds .claude/hillclimb/capture/compare.html: every version side by side.
//   - By set: each version's pass rate and its change from the previous version,
//     coloured only when the change is bigger than run-to-run noise.
//   - By case: each version's result per case (e.g. 0/3 → 1/3 → 3/3), with
//     improvements and regressions marked; "only what changed" filter.
// Filters by suite (capability / regression). Data is embedded as JSON and
// rendered with textContent, so nothing from the results can become markup.
//
//   node evals/capture/build-compare.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const FLOW = join(ROOT, '.claude', 'hillclimb', 'capture')
const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// Versions in order: baseline, v1, v2, …
const variants = readdirSync(FLOW)
  .filter((d) => /^(baseline|v[1-9]\d*(-[a-z0-9.]+)?)$/.test(d) && existsSync(join(FLOW, d, 'results.jsonl'))) // v4-mini: v4 on another model
  .sort((a, b) => (a === 'baseline' ? -1 : b === 'baseline' ? 1 : parseInt(a.slice(1)) - parseInt(b.slice(1)) || a.localeCompare(b)))

// What each version was: the agent code commit from its latest run in the ledger.
const ledger = readFileSync(join(ROOT, 'evals', 'capture', 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const versions = variants.map((v) => {
  const run = ledger.filter((e) => e.event === 'run' && e.variant === v).at(-1)
  const tested = run?.agent_code_from ?? run?.git_commit ?? ''
  // Name the version by the latest change to the agent's code as of that commit (not the eval-run commit).
  const [commit = '', subject = ''] = tested ? git('log', '-1', '--format=%h%x09%s', tested, '--', 'server/agent', 'server/db', 'server/llm').split('\t') : []
  return { id: v, commit, subject }
})

const cases = JSON.parse(readFileSync(join(ROOT, 'evals', 'capture', 'cases.json'), 'utf8')).cases
const suites = existsSync(join(ROOT, 'evals', 'capture', 'suites.json')) ? JSON.parse(readFileSync(join(ROOT, 'evals', 'capture', 'suites.json'), 'utf8')) : null
const suiteOf = (id) => (suites?.test?.includes(id) ? 'test' : suites?.capability.includes(id) ? 'capability' : suites?.regression.includes(id) ? 'regression' : '')

// results[case][variant] = { passes, reps } — passes/reps over that case's runs
const results = {}
for (const v of variants) {
  for (const line of readFileSync(join(FLOW, v, 'results.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue
    const r = JSON.parse(line)
    const cell = ((results[r.prompt_id] ??= {})[v] ??= { passes: 0, reps: 0 })
    cell.reps++
    if (r.grade?.pass === 1) cell.passes++
  }
}

const SET_NAMES = {
  empty: 'A · Empty house', existing: 'B · Existing places', shelving: 'C · Shelving units', stack: 'D · Box stacks',
  pantry: 'E · Pantry', lookup: 'F · Simple lookups', journey: 'G · Lookups after changes', groups: 'H · Groups of things',
  duplicates: 'I · Same-named things', positional: 'J · Position words', spatial: 'K · Picture of the furniture',
}
const data = {
  versions,
  sets: SET_NAMES,
  cases: cases
    .filter((c) => results[c.id])
    .map((c) => ({ id: c.id, set: c.set, suite: suiteOf(c.id), text: c.question ?? c.update ?? c.said ?? '', results: results[c.id] })),
}
const json = JSON.stringify(data).replace(/</g, '\\u003c')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Version Comparison</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e0;--up:#15803d;--up-bg:#dcfce7;--down:#b42318;--down-bg:#fdecea;--cell:#eef2ff;--cell-fg:#1e3a8a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--up:#4ade80;--up-bg:#14301f;--down:#f97066;--down-bg:#2f1714;--cell:#1e2440;--cell-fg:#c7d2fe}}
:root[data-theme="dark"]{--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--up:#4ade80;--up-bg:#14301f;--down:#f97066;--down-bg:#2f1714;--cell:#1e2440;--cell-fg:#c7d2fe}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 80px}
h1{font-size:24px;margin:0 0 4px}
h2{font-size:18px;margin:28px 0 8px}
.sub{color:var(--muted);margin:0 0 16px;max-width:780px}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;align-items:center}
.filters button{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}
.filters button.on{background:var(--fg);color:var(--bg)}
.filters label{margin-left:8px;color:var(--muted)}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;white-space:nowrap}
th{font-size:13px;color:var(--muted);font-weight:600}
th .commit{display:block;font-weight:400;font-size:12px;white-space:normal;max-width:190px}
td.text{white-space:normal;min-width:260px;color:var(--muted);font-size:14px}
.rate{font-weight:600;font-variant-numeric:tabular-nums}
.runs{display:block;font-size:12px;color:var(--muted)}
.delta{display:inline-block;margin-left:6px;font-size:12px;font-weight:600;border-radius:6px;padding:0 6px}
.delta.up{color:var(--up);background:var(--up-bg)}
.delta.down{color:var(--down);background:var(--down-bg)}
.delta.flat{color:var(--muted)}
.cellv{display:inline-block;min-width:44px;text-align:center;border-radius:6px;padding:1px 6px;font-variant-numeric:tabular-nums}
.mark{font-size:12px;margin-left:4px}
.mark.up{color:var(--up)}.mark.down{color:var(--down)}
a{color:inherit}
tr.total td{font-weight:600;border-top:2px solid var(--line)}
.legend{font-size:13px;color:var(--muted);margin:8px 0 0}
.bar{height:6px;width:120px;max-width:100%;background:var(--line);border-radius:3px;overflow:hidden;margin:4px 0 2px}
.bar div{height:100%;background:var(--up);border-radius:3px}
</style></head>
<body><main>
<h1>Version by version</h1>
<p class="sub">Each version of the agent on the same cases. The number is the share of runs that passed (higher is better); the badge is the change from the previous version. Changes are coloured only when they’re bigger than run-to-run noise for that many runs — grey means “could be noise”.</p>
<div class="filters" id="suites">
  <button data-s="all" class="on">All dev cases</button>
  <button data-s="capability">Capability suite</button>
  <button data-s="regression">Regression suite</button>
  <button data-s="test" title="The held-out set: totals only, never individual cases">Test (held out)</button>
  <label><input type="checkbox" id="changed"> Only cases that changed</label>
</div>
<h2>Head to head</h2>
<p class="sub">Each version against the one before it (a model variant like v4-kimi3 against its own version, v4), on the cases <em>both</em> ran — a paired comparison, which is far more sensitive than comparing two percentages. “Better/worse” counts cases whose pass rate went up or down. The interval is a 95% bootstrap over cases (cases resampled, not runs, since runs of one case aren’t independent); the sign test asks whether that many more cases got better than worse could be chance.</p>
<div class="wrap"><table id="pairs"></table></div>
<h2>Reliability</h2>
<p class="sub">pass@1 is the average share of runs that pass. pass^3 is the chance that <em>three</em> runs of the same case all pass — what matters for an app you rely on. It’s estimated only from cases with at least 3 runs (with adaptive repeats, those are mostly the cases that changed, so it skews toward the hard ones).</p>
<div class="wrap"><table id="reliability"></table></div>
<h2>By set</h2>
<div class="wrap"><table id="bySet"></table></div>
<p class="legend">Hover a number for the exact runs. A set only shows a version once that version has run its cases.</p>
<h2>By case</h2>
<p class="legend" id="heldNote" hidden>The held-out test set shows totals only. Looking at individual test cases while changing prompts turns them into dev cases — see evals/capture/test_cases.py.</p>
<div class="wrap" id="byCaseWrap"><table id="byCase"></table></div>
</main>
<script>
var DATA = ${json};
var suite = 'all';
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function pct(p, n) { return n ? Math.round(100 * p / n) : null; }
// Is the change between two pass rates bigger than noise? (95% interval for a difference of proportions)
function significant(p1, n1, p2, n2) {
  if (!n1 || !n2) return false;
  var a = p1 / n1, b = p2 / n2, pooled = (p1 + p2) / (n1 + n2);
  var se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  return se === 0 ? a !== b : Math.abs(a - b) > 1.96 * se;
}
// A case "changed" if its pass rate differs between any two versions that ran it.
function changed(c) {
  var rates = DATA.versions.map(function (v) { var r = c.results[v.id]; return r ? r.passes / r.reps : null; }).filter(function (x) { return x !== null; });
  return rates.some(function (x) { return x !== rates[0]; });
}
function visibleCases() {
  var onlyChanged = document.getElementById('changed').checked;
  return DATA.cases.filter(function (c) {
    var inSuite = suite === 'all' ? c.suite !== 'test' : c.suite === suite; // "all" = every dev case
    return inSuite && (!onlyChanged || changed(c));
  });
}
// ── statistics ──
// A seeded random generator, so the page shows the same intervals every time it's built.
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// 95% interval for the mean of xs, resampling the xs (one per case).
function bootstrap(xs, iters) {
  if (!xs.length) return null;
  var r = rng(12345), means = [];
  for (var i = 0; i < (iters || 2000); i++) { var s = 0; for (var j = 0; j < xs.length; j++) s += xs[Math.floor(r() * xs.length)]; means.push(s / xs.length); }
  means.sort(function (a, b) { return a - b; });
  return [means[Math.floor(0.025 * means.length)], means[Math.floor(0.975 * means.length)]];
}
// Two-sided exact sign test: with w wins and l losses (ties dropped), how likely is a split at least this lopsided by chance?
function signTest(w, l) {
  var n = w + l; if (!n) return 1;
  var k = Math.min(w, l), p = 0, c = 1;
  for (var i = 0; i <= n; i++) { if (i > 0) c = c * (n - i + 1) / i; if (i <= k) p += c; }
  return Math.min(1, 2 * p / Math.pow(2, n));
}
// pass^k for one case from c passes in n runs: the chance k runs drawn from these all pass (tau-bench's estimator).
function passHatK(c, n, k) { if (n < k) return null; var p = 1; for (var i = 0; i < k; i++) p *= (c - i) / (n - i); return Math.max(0, p); }
function pts(x) { return (x > 0 ? '+' : x < 0 ? '−' : '±') + Math.abs(Math.round(x * 1000) / 10) + ' pts'; }
function renderPairs() {
  var table = document.getElementById('pairs'); table.textContent = '';
  var head = el('tr'); ['Change', 'Cases both ran', 'Difference', '95% interval', 'Better / worse / same', 'Sign test', 'Verdict'].forEach(function (h) { head.appendChild(el('th', '', h)); });
  var thead = el('thead'); thead.appendChild(head); table.appendChild(thead);
  var body = el('tbody'); var cs = visibleCases(); var any = false;
  // Each version against the version before it; a model variant (v4-kimi3) against its own version (v4).
  var ids = DATA.versions.map(function (v) { return v.id; });
  var pairs = [];
  ids.forEach(function (b, i) {
    if (i === 0) return;
    var dash = b.indexOf('-');
    var a = dash > 0 ? b.slice(0, dash) : ids.slice(0, i).filter(function (x) { return x.indexOf('-') < 0; }).pop();
    if (a && ids.indexOf(a) >= 0) pairs.push([a, b]);
  });
  for (var i = 0; i < pairs.length; i++) {
    var a = pairs[i][0], b = pairs[i][1];
    var diffs = [], w = 0, l = 0, t = 0;
    cs.forEach(function (c) { var ra = c.results[a], rb = c.results[b]; if (!ra || !rb) return; var d = rb.passes / rb.reps - ra.passes / ra.reps; diffs.push(d); if (d > 0) w++; else if (d < 0) l++; else t++; });
    if (!diffs.length) continue;
    any = true;
    var mean = diffs.reduce(function (s, x) { return s + x; }, 0) / diffs.length, ci = bootstrap(diffs), p = signTest(w, l);
    var real = ci && (ci[0] > 0 || ci[1] < 0);
    var tr = el('tr');
    tr.appendChild(el('td', '', a + ' → ' + b));
    tr.appendChild(el('td', '', String(diffs.length)));
    var d = el('td'); d.appendChild(el('span', 'delta ' + (!real ? 'flat' : mean > 0 ? 'up' : 'down'), pts(mean))); tr.appendChild(d);
    tr.appendChild(el('td', '', ci ? pts(ci[0]) + ' to ' + pts(ci[1]) : '—'));
    tr.appendChild(el('td', '', w + ' / ' + l + ' / ' + t));
    tr.appendChild(el('td', '', p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3)));
    tr.appendChild(el('td', '', real ? (mean > 0 ? 'Better — beyond noise' : 'Worse — beyond noise') : 'Could be noise'));
    body.appendChild(tr);
  }
  if (!any) { var none = el('tr'); none.appendChild(el('td', '', 'No two consecutive versions share cases under this filter.')); body.appendChild(none); }
  table.appendChild(body);
}
function renderReliability() {
  var table = document.getElementById('reliability'); table.textContent = '';
  var head = el('tr'); ['Version', 'pass@1 (all cases)', '95% interval', 'pass^3', 'Cases with 3+ runs'].forEach(function (h) { head.appendChild(el('th', '', h)); });
  var thead = el('thead'); thead.appendChild(head); table.appendChild(thead);
  var body = el('tbody'); var cs = visibleCases();
  DATA.versions.forEach(function (v) {
    var rates = [], hats = [];
    cs.forEach(function (c) { var r = c.results[v.id]; if (!r) return; rates.push(r.passes / r.reps); var h = passHatK(r.passes, r.reps, 3); if (h !== null) hats.push(h); });
    if (!rates.length) return;
    var mean = rates.reduce(function (s, x) { return s + x; }, 0) / rates.length, ci = bootstrap(rates);
    var tr = el('tr');
    tr.appendChild(el('td', '', v.id));
    tr.appendChild(el('td', 'rate', Math.round(mean * 100) + '%'));
    tr.appendChild(el('td', '', ci ? Math.round(ci[0] * 100) + '–' + Math.round(ci[1] * 100) + '%' : '—'));
    tr.appendChild(el('td', 'rate', hats.length ? Math.round(100 * hats.reduce(function (s, x) { return s + x; }, 0) / hats.length) + '%' : '—'));
    tr.appendChild(el('td', '', hats.length + ' of ' + rates.length));
    body.appendChild(tr);
  });
  table.appendChild(body);
}
function header(table, first, extra) {
  var tr = el('tr'); tr.appendChild(el('th', '', first)); if (extra) tr.appendChild(el('th', '', extra));
  DATA.versions.forEach(function (v) { var th = el('th', '', v.id); th.appendChild(el('span', 'commit', (v.commit ? v.commit + ' · ' : '') + v.subject)); tr.appendChild(th); });
  var thead = el('thead'); thead.appendChild(tr); table.appendChild(thead);
}
function deltaBadge(prev, cur) {
  if (!prev || !prev.n || !cur.n) return null;
  var d = pct(cur.p, cur.n) - pct(prev.p, prev.n);
  var sig = significant(prev.p, prev.n, cur.p, cur.n);
  var b = el('span', 'delta ' + (d === 0 ? 'flat' : !sig ? 'flat' : d > 0 ? 'up' : 'down'), (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' pts');
  b.title = sig ? 'Bigger than run-to-run noise' : 'Within run-to-run noise';
  return b;
}
function renderSets() {
  var table = document.getElementById('bySet'); table.textContent = '';
  header(table, 'Set');
  var body = el('tbody'); var cs = visibleCases();
  var rows = Object.keys(DATA.sets).filter(function (k) { return cs.some(function (c) { return c.set === k; }); }).map(function (k) { return [DATA.sets[k], cs.filter(function (c) { return c.set === k; }), false]; });
  rows.push([document.getElementById('changed').checked ? 'All shown (changed cases only)' : 'All shown', cs, true]);
  if (!cs.length) { var none = el('tr'); none.appendChild(el('td', '', 'No cases match these filters.')); body.appendChild(none); table.appendChild(body); return; }
  rows.forEach(function (row) {
    var tr = el('tr', row[2] ? 'total' : ''); tr.appendChild(el('td', '', row[0]));
    var prev = null;
    DATA.versions.forEach(function (v) {
      var p = 0, n = 0, cases = 0;
      row[1].forEach(function (c) { var r = c.results[v.id]; if (r) { p += r.passes; n += r.reps; cases++; } });
      var td = el('td');
      if (n) {
        var rate = el('span', 'rate', pct(p, n) + '%'); rate.title = p + ' of ' + n + ' runs passed (' + cases + ' cases)'; td.appendChild(rate);
        var badge = deltaBadge(prev, { p: p, n: n }); if (badge) td.appendChild(badge);
        var bar = el('div', 'bar'); bar.title = p + ' of ' + n + ' runs passed';
        var fill = el('div'); fill.style.width = pct(p, n) + '%'; bar.appendChild(fill); td.appendChild(bar);
        td.appendChild(el('span', 'runs', p + '/' + n + ' runs'));
        prev = { p: p, n: n };
      } else td.appendChild(el('span', 'runs', 'not run'));
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
}
function renderCases() {
  var table = document.getElementById('byCase'); table.textContent = '';
  header(table, 'Case', 'What it asks');
  var body = el('tbody');
  visibleCases().forEach(function (c) {
    var cells = [], prev = null;
    DATA.versions.forEach(function (v) {
      var r = c.results[v.id]; var td = el('td');
      if (r) {
        var rate = r.passes / r.reps;
        var chip = el('span', 'cellv', r.passes + '/' + r.reps);
        chip.style.background = 'color-mix(in srgb, var(--up-bg) ' + Math.round(rate * 100) + '%, var(--down-bg))';
        var a = el('a'); a.href = 'cases-' + v.id + '.html#' + c.id; a.appendChild(chip); td.appendChild(a);
        if (prev !== null && rate !== prev) { td.appendChild(el('span', 'mark ' + (rate > prev ? 'up' : 'down'), rate > prev ? '▲' : '▼')); }
        prev = rate;
      } else td.appendChild(el('span', 'runs', '—'));
      cells.push(td);
    });
    var tr = el('tr'); tr.appendChild(el('td', '', c.id)); tr.appendChild(el('td', 'text', c.text));
    cells.forEach(function (td) { tr.appendChild(td); }); body.appendChild(tr);
  });
  table.appendChild(body);
}
function render() {
  renderPairs(); renderReliability(); renderSets();
  var held = suite === 'test';
  document.getElementById('heldNote').hidden = !held;
  document.getElementById('byCaseWrap').hidden = held;
  if (!held) renderCases();
}
document.getElementById('suites').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (!b) return;
  suite = b.getAttribute('data-s');
  document.querySelectorAll('#suites button').forEach(function (x) { x.classList.toggle('on', x === b); });
  render();
});
document.getElementById('changed').addEventListener('change', render);
render();
</script>
</body></html>
`
writeFileSync(join(FLOW, 'compare.html'), html)
console.log(`wrote ${join(FLOW, 'compare.html')} (${variants.join(', ')}; ${data.cases.length} cases)`)
