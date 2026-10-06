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

// Versions in order: baseline, v1, v2, … (a model variant like v4-mini right after its version)
const versionNumber = (v) => (v.startsWith('baseline') ? 0 : parseInt(v.slice(1)))
const variants = readdirSync(FLOW)
  .filter((d) => /^(baseline|v[1-9]\d*)(-[a-z0-9.]+)?$/.test(d) && existsSync(join(FLOW, d, 'results.jsonl'))) // v4-mini: v4 on another model
  .sort((a, b) => versionNumber(a) - versionNumber(b) || a.length - b.length || a.localeCompare(b))

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
const suiteOf = (id) => (suites?.test?.includes(id) ? 'test' : suites?.robustness?.includes(id) ? 'robustness' : suites?.capability.includes(id) ? 'capability' : suites?.regression.includes(id) ? 'regression' : '')

// Why a run failed, from the grader's explanation. A run can have several causes.
// failure-labels.json overrides by hand ("v6/C11/0": "simulated person") for the
// causes no rule can see: the simulated person answered wrongly, or the grader was wrong.
const CAUSES = [
  ['Guessed instead of asking', /should have asked/],
  ['Filed in the wrong place', /filed at /],
  ['Item not filed', /no item/],
  ['Duplicate or extra places', /item\(s\) named .* expected|created \d+ new place/],
  ['Position not recorded', /isn.t marked/],
  ['Look-alike units mixed up', /should be on (different|the same) unit/],
  ['Stack order or box contents wrong', /reads as position|moved into a different box|isn.t in a box/],
  ['Reply left something out', /reply doesn.t mention/],
  ['Reply gave a stale place', /reply mentions stale/],
]
const labelsPath = join(ROOT, 'evals', 'capture', 'failure-labels.json')
const labels = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, 'utf8')) : {}
function causesOf(variant, r) {
  const label = labels[`${variant}/${r.prompt_id}/${r.rep ?? 0}`]
  if (label) return [label]
  const why = String(r.explanation?.pass ?? '')
  const found = CAUSES.filter(([, re]) => re.test(why)).map(([name]) => name)
  return found.length ? found : ['Other']
}

// results[case][variant] = { passes, reps, causes } — over that case's runs; causes counts failing runs by cause
const results = {}
const crashes = {} // crashes[case][variant] = runs that crashed with no graded result
for (const v of variants) {
  for (const line of readFileSync(join(FLOW, v, 'results.jsonl'), 'utf8').split('\n')) {
    if (!line.trim()) continue
    const r = JSON.parse(line)
    const cell = ((results[r.prompt_id] ??= {})[v] ??= { passes: 0, reps: 0, causes: {} })
    cell.reps++
    if (r.grade?.pass === 1) cell.passes++
    else for (const cause of causesOf(v, r)) cell.causes[cause] = (cell.causes[cause] ?? 0) + 1
  }
  // Runs that crashed (API or harness errors) never reach results.jsonl; count the latest error per case/rep that has no result.
  const errPath = join(FLOW, v, 'errors.jsonl')
  if (existsSync(errPath)) {
    const crashed = new Map()
    for (const line of readFileSync(errPath, 'utf8').split('\n')) if (line.trim()) { const e = JSON.parse(line); crashed.set(`${e.prompt_id}/${e.rep}`, e) }
    // Kept apart from results, so a case whose every run crashed never shows up as a 0-run pass rate.
    for (const e of crashed.values()) if (!results[e.prompt_id]?.[v]) ((crashes[e.prompt_id] ??= {})[v] = (crashes[e.prompt_id]?.[v] ?? 0) + 1)
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
    .filter((c) => results[c.id] || crashes[c.id])
    .map((c) => ({ id: c.id, set: c.set, suite: suiteOf(c.id), perturbs: c.perturbs, text: c.question ?? c.update ?? c.said ?? '', results: results[c.id] ?? {}, crashes: crashes[c.id] ?? {} })),
}
const json = JSON.stringify(data).replace(/</g, '\\u003c')

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<title>Version Comparison</title>
<style>
:root{--m1:#1d4ed8;--m2:#c2410c;--m3:#6b7280;--bg:#f7f7f5;--card:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e0;--up:#15803d;--up-bg:#dcfce7;--down:#b42318;--down-bg:#fdecea;--cell:#eef2ff;--cell-fg:#1e3a8a}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--m1:#7aa2ff;--m2:#fb923c;--m3:#9ca3af;--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--up:#4ade80;--up-bg:#14301f;--down:#f97066;--down-bg:#2f1714;--cell:#1e2440;--cell-fg:#c7d2fe}}
:root[data-theme="dark"]{--m1:#7aa2ff;--m2:#fb923c;--m3:#9ca3af;--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--up:#4ade80;--up-bg:#14301f;--down:#f97066;--down-bg:#2f1714;--cell:#1e2440;--cell-fg:#c7d2fe}
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
td.none{color:var(--muted)}
.chartwrap{padding:12px 8px 4px}
#mv{display:block;width:100%;height:auto;max-width:900px}
#mv text{fill:var(--fg);font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
#mv .axis{stroke:var(--line)}
#mv .muted{fill:var(--muted)}
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
  <button data-s="robustness" title="Noisy copies of dev cases (perturb.py)">Robustness</button>
  <button data-s="test" title="The held-out set: totals only, never individual cases">Test (held out)</button>
  <label><input type="checkbox" id="changed"> Only cases that changed</label>
</div>
<h2>Each model across versions</h2>
<p class="sub">A line is one model running each version of the agent’s code (prompts and tools as they were at that version). It follows the filter above; pick <strong>Capability suite</strong> to compare every model on the same 50 cases. Whiskers are 95% intervals over cases. Other models appear as single points at the version they ran. The gpt-5.4-mini line was run in one go under today’s harness; gpt-5.5’s points were run as each version was made, its early ones (baseline–v2) with an older, terser simulated person, so its early climb is partly harness changes.</p>
<p class="legend" id="mvNote"></p>
<div class="wrap chartwrap"><svg id="mv" role="img" aria-label="Pass rate by version for each model"></svg></div>
<div class="wrap"><table id="mvTable"></table></div>
<h2>By set, version by version</h2>
<div class="wrap"><table id="bySet"></table></div>
<p class="legend">Hover a number for the exact runs. A set only shows a version once that version has run its cases.</p>
<h2>Head to head</h2>
<p class="sub">Each version against the one before it (a model variant like v4-kimi3 against its own version, v4), on the cases <em>both</em> ran — a paired comparison, which is far more sensitive than comparing two percentages. “Better/worse” counts cases whose pass rate went up or down. The interval is a 95% bootstrap over cases (cases resampled, not runs, since runs of one case aren’t independent); the sign test asks whether that many more cases got better than worse could be chance.</p>
<div class="wrap"><table id="pairs"></table></div>
<h2>Robustness gap</h2>
<p class="sub">Each robustness case is a dev case said worse — speech-to-text noise, filler words, unrelated chit-chat — with the same facts. The gap is how much the pass rate drops from the clean case to its noisy copy, over pairs where both were run. “Broken by noise” counts clean cases that passed every run while their noisy copy failed at least once.</p>
<div class="wrap"><table id="robust"></table></div>
<h2>Why cases fail</h2>
<p class="sub">Failing runs sorted by cause, from the grader’s explanation (a run can count under more than one). Read this before changing a prompt: the biggest row is usually the next thing to fix — and rows that are really the simulated person’s or the grader’s fault belong in <code>evals/capture/failure-labels.json</code>, not in a prompt change.</p>
<div class="wrap"><table id="causes"></table></div>
<h2>Reliability</h2>
<p class="sub">pass@1 is the average share of runs that pass. pass^3 is the chance that <em>three</em> runs of the same case all pass — what matters for an app you rely on. It’s estimated only from cases with at least 3 runs (with adaptive repeats, those are mostly the cases that changed, so it skews toward the hard ones).</p>
<div class="wrap"><table id="reliability"></table></div>

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
    var inSuite = suite === 'all' ? c.suite !== 'test' && c.suite !== 'robustness' : c.suite === suite; // "all" = every dev case
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
// ── model × version ──
var MAIN_MODEL = 'gpt-5.5';
function split(id) { var i = id.indexOf('-'); return i < 0 ? { version: id, model: MAIN_MODEL } : { version: id.slice(0, i), model: id.slice(i + 1) }; }
function modelName(m) { return m === 'mini' ? 'gpt-5.4-mini' : m === 'kimi3' ? 'Kimi K3' : m === 'kimi25' ? 'Kimi K2.5' : m === 'glm5' ? 'GLM-5' : m === 'deepseek' ? 'DeepSeek V3.2' : m; }
function renderModelVersion() {
  // The filter's cases. Each model's line uses only the cases that EVERY version on that line ran, so its points are comparable.
  var pool = visibleCases();
  var byModel = {};
  DATA.versions.forEach(function (v) { var s = split(v.id); (byModel[s.model] = byModel[s.model] || []).push(v.id); });
  var versions = [], models = [], cell = {}, lineCases = {};
  Object.keys(byModel).forEach(function (m) {
    var ids = byModel[m].filter(function (id) { return pool.some(function (c) { return c.results[id]; }); });
    lineCases[m] = 0;
    ids.forEach(function (id) {
      var s = split(id);
      var ran = pool.filter(function (c) { return c.results[id]; });
      lineCases[m] = Math.max(lineCases[m], ran.length);
      var rates = ran.map(function (c) { var r = c.results[id]; return r.passes / r.reps; });
      if (!rates.length) return;
      if (models.indexOf(m) < 0) models.push(m);
      cell[s.version + '|' + m] = { mean: rates.reduce(function (a, b) { return a + b; }, 0) / rates.length, ci: bootstrap(rates), n: rates.length, of: pool.length };
    });
  });
  DATA.versions.forEach(function (v) { var s = split(v.id); if (Object.keys(cell).some(function (k) { return k.indexOf(s.version + '|') === 0; }) && versions.indexOf(s.version) < 0) versions.push(s.version); });
  // A point that ran well under its line's widest point covers different cases: drawn hollow, not directly comparable.
  var widest = Math.max.apply(null, Object.keys(cell).map(function (k) { return cell[k].n; }).concat([0]));
  Object.keys(cell).forEach(function (k) { cell[k].partial = cell[k].n < 0.6 * widest; });
  document.getElementById('mvNote').textContent = pool.length
    ? 'Each point is the cases that version ran in this filter (' + pool.length + ' cases); counts are in the table. A hollow point ran far fewer of these cases than the widest point, so it isn’t directly comparable — pick Capability suite to compare everything on the same 50.'
    : 'No cases in this filter.';
  // Lines for models with 2+ versions; the rest are points.
  var lineModels = models.filter(function (m) { return versions.filter(function (v) { return cell[v + '|' + m]; }).length > 1; });
  var colors = ['var(--m1)', 'var(--m2)'];
  var W = 860, H = 300, L = 44, R = 150, T = 14, B = 34;
  var x = function (i) { return L + (versions.length < 2 ? 0 : i * (W - L - R) / (versions.length - 1)); };
  var y = function (p) { return T + (1 - p) * (H - T - B); };
  var svg = document.getElementById('mv'); svg.textContent = ''; svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, text) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text !== undefined) e.textContent = text; svg.appendChild(e); return e; }
  [0, 0.25, 0.5, 0.75, 1].forEach(function (p) { s('line', { x1: L, x2: W - R, y1: y(p), y2: y(p), class: 'axis' }); s('text', { x: L - 8, y: y(p) + 4, 'text-anchor': 'end', class: 'muted' }, Math.round(p * 100) + '%'); });
  versions.forEach(function (v, i) { s('text', { x: x(i), y: H - 10, 'text-anchor': 'middle', class: 'muted' }, v); });
  lineModels.forEach(function (m, k) {
    var color = colors[k] || 'var(--m3)', pts = [];
    versions.forEach(function (v, i) { var c = cell[v + '|' + m]; if (c) pts.push([x(i), y(c.mean), c, v]); });
    s('polyline', { points: pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' '), fill: 'none', stroke: color, 'stroke-width': 2 });
    pts.forEach(function (p) {
      if (p[2].ci) s('line', { x1: p[0], x2: p[0], y1: y(p[2].ci[1]), y2: y(p[2].ci[0]), stroke: color, 'stroke-width': 1.5, opacity: 0.5 });
      var dot = p[2].partial ? s('circle', { cx: p[0], cy: p[1], r: 4.5, fill: 'var(--card)', stroke: color, 'stroke-width': 2 }) : s('circle', { cx: p[0], cy: p[1], r: 4.5, fill: color, stroke: 'var(--card)', 'stroke-width': 2 });
      var tip = document.createElementNS(NS, 'title'); tip.textContent = modelName(m) + ' · ' + p[3] + ': ' + Math.round(p[2].mean * 100) + '% (' + (p[2].ci ? Math.round(p[2].ci[0] * 100) + '–' + Math.round(p[2].ci[1] * 100) + '%, ' : '') + p[2].n + ' cases' + (p[2].partial ? ' — fewer cases than the rest of this line' : '') + ')'; dot.appendChild(tip);
    });
    var last = pts[pts.length - 1]; if (last) s('text', { x: W - R + 10, y: last[1] + 4, fill: color, style: 'fill:' + color + ';font-weight:600' }, modelName(m));
  });
  models.filter(function (m) { return lineModels.indexOf(m) < 0; }).forEach(function (m) {
    versions.forEach(function (v, i) {
      var c = cell[v + '|' + m]; if (!c) return;
      var dot = c.partial ? s('circle', { cx: x(i) + 10, cy: y(c.mean), r: 3.5, fill: 'var(--card)', stroke: 'var(--m3)', 'stroke-width': 1.5 }) : s('circle', { cx: x(i) + 10, cy: y(c.mean), r: 3.5, fill: 'var(--m3)' });
      var tip = document.createElementNS(NS, 'title'); tip.textContent = modelName(m) + ' · ' + v + ': ' + Math.round(c.mean * 100) + '% (' + c.n + ' cases)'; dot.appendChild(tip);
      s('text', { x: x(i) + 17, y: y(c.mean) + 4, class: 'muted' }, modelName(m));
    });
  });
  // The same numbers as a table.
  var table = document.getElementById('mvTable'); table.textContent = '';
  var head = el('tr'); head.appendChild(el('th', '', 'Version'));
  models.forEach(function (m) { head.appendChild(el('th', '', modelName(m))); });
  var thead = el('thead'); thead.appendChild(head); table.appendChild(thead);
  var body = el('tbody');
  versions.forEach(function (v) {
    var tr = el('tr'); tr.appendChild(el('td', '', v));
    models.forEach(function (m) {
      var c = cell[v + '|' + m], td = el('td');
      if (c) { td.appendChild(el('span', 'rate', Math.round(c.mean * 100) + '%')); td.appendChild(el('span', 'runs', (c.ci ? Math.round(c.ci[0] * 100) + '–' + Math.round(c.ci[1] * 100) + '% · ' : '') + c.n + ' cases')); }
      else td.appendChild(el('span', 'none', '·'));
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
}
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
    // A model's own line: v3-mini → v4-mini.
    if (dash > 0) { var suffix = b.slice(dash); var prev = ids.slice(0, i).filter(function (x) { return x.slice(x.indexOf('-')) === suffix && x.indexOf('-') > 0; }).pop(); if (prev) pairs.push([prev, b]); }
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
function renderRobustness() {
  var table = document.getElementById('robust'); table.textContent = '';
  var head = el('tr'); ['Version', 'Pairs run', 'Clean', 'Noisy', 'Gap', '95% interval', 'Broken by noise'].forEach(function (h) { head.appendChild(el('th', '', h)); });
  var thead = el('thead'); thead.appendChild(head); table.appendChild(thead);
  var byId = {}; DATA.cases.forEach(function (c) { byId[c.id] = c; });
  var body = el('tbody'), any = false;
  DATA.versions.forEach(function (v) {
    var gaps = [], clean = 0, noisy = 0, broken = [];
    DATA.cases.forEach(function (c) {
      if (!c.perturbs) return;
      var src = byId[c.perturbs], rn = c.results[v.id], rs = src && src.results[v.id];
      if (!rn || !rs) return;
      var a = rs.passes / rs.reps, b = rn.passes / rn.reps;
      gaps.push(a - b); clean += a; noisy += b;
      if (a === 1 && b < 1) broken.push(c.id);
    });
    if (!gaps.length) return;
    any = true;
    var n = gaps.length, mean = gaps.reduce(function (s, x) { return s + x; }, 0) / n, ci = bootstrap(gaps);
    var tr = el('tr');
    tr.appendChild(el('td', '', v.id)); tr.appendChild(el('td', '', String(n)));
    tr.appendChild(el('td', 'rate', Math.round(100 * clean / n) + '%')); tr.appendChild(el('td', 'rate', Math.round(100 * noisy / n) + '%'));
    var real = ci && (ci[0] > 0 || ci[1] < 0);
    var g = el('td'); g.appendChild(el('span', 'delta ' + (!real ? 'flat' : mean > 0 ? 'down' : 'up'), (mean > 0 ? '−' : '+') + Math.abs(Math.round(mean * 1000) / 10) + ' pts')); tr.appendChild(g);
    tr.appendChild(el('td', '', ci ? pts(-ci[1]) + ' to ' + pts(-ci[0]) : '—'));
    var b = el('td', 'text', broken.length ? broken.length + ': ' + broken.join(', ') : 'none'); tr.appendChild(b);
    body.appendChild(tr);
  });
  if (!any) { var none = el('tr'); none.appendChild(el('td', '', 'No version has run the robustness suite yet (npm run eval:capture -- --variant vN --suite robustness).')); body.appendChild(none); }
  table.appendChild(body);
}
function renderCauses() {
  var table = document.getElementById('causes'); table.textContent = '';
  header(table, 'Cause', null, true);
  var cs = visibleCases(), totals = {}, names = [];
  DATA.versions.forEach(function (v) {
    cs.forEach(function (c) {
      var r = c.results[v.id]; if (!r) return;
      Object.keys(r.causes || {}).forEach(function (k) { if (names.indexOf(k) < 0) names.push(k); (totals[k] = totals[k] || {})[v.id] = ((totals[k] || {})[v.id] || 0) + r.causes[k]; });
    });
    cs.forEach(function (c) {
      var n = (c.crashes || {})[v.id]; if (!n) return;
      var k = 'Run crashed (API or harness)'; if (names.indexOf(k) < 0) names.push(k); (totals[k] = totals[k] || {})[v.id] = ((totals[k] || {})[v.id] || 0) + n;
    });
  });
  var body = el('tbody');
  if (!names.length) { var none = el('tr'); none.appendChild(el('td', '', 'No failures under this filter.')); body.appendChild(none); }
  names.sort(function (a, b) { var sa = 0, sb = 0; DATA.versions.forEach(function (v) { sa += (totals[a][v.id] || 0); sb += (totals[b][v.id] || 0); }); return sb - sa; });
  names.forEach(function (k) {
    var tr = el('tr'); tr.appendChild(el('td', '', k));
    DATA.versions.forEach(function (v) { var n = totals[k][v.id]; tr.appendChild(el('td', n ? 'rate' : 'none', n ? String(n) : '·')); });
    body.appendChild(tr);
  });
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
function header(table, first, extra, compact) {
  var tr = el('tr'); tr.appendChild(el('th', '', first)); if (extra) tr.appendChild(el('th', '', extra));
  DATA.versions.forEach(function (v) { var th = el('th', '', v.id); if (compact) th.title = (v.commit ? v.commit + ' · ' : '') + v.subject; else th.appendChild(el('span', 'commit', (v.commit ? v.commit + ' · ' : '') + v.subject)); tr.appendChild(th); });
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
  renderModelVersion(); renderPairs(); renderRobustness(); renderCauses(); renderReliability(); renderSets();
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
