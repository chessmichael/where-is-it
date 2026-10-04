import type { InspectReport, ItemView, PlaceNode } from './inspect'

// Renders an InspectReport as one self-contained page: no scripts, nothing
// loaded from the network, every value escaped. Sections open and close with
// <details>. Used by the app (/api/inspect) and the local tool (npm run inspect).

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function renderInspector(report: InspectReport, opts: { title: string; subtitle?: string }): string {
  const warnings = report.health.filter((h) => h.level === 'warning')
  const notes = report.health.filter((h) => h.level === 'note')
  const placeCount = report.counts.locations ?? 0
  const itemCount = report.counts.items ?? 0

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<title>House Inspector</title>
<style>${CSS}</style></head>
<body><main>
<header class="top">
  <h1>${esc(opts.title)}</h1>
  <p class="sub">${esc(opts.subtitle ?? '')}${opts.subtitle ? ' · ' : ''}generated ${esc(new Date(report.generatedAt).toLocaleString())}</p>
  <div class="chips">
    <span class="chip"><b>${placeCount}</b> places</span>
    <span class="chip"><b>${itemCount}</b> items</span>
    <span class="chip"><b>${report.counts.inbox ?? 0}</b> things said</span>
    <span class="chip ${warnings.length ? 'warn' : 'ok'}"><b>${warnings.length}</b> warning${warnings.length === 1 ? '' : 's'}</span>
    ${report.openQuestions.length ? `<span class="chip warn"><b>${report.openQuestions.length}</b> open question${report.openQuestions.length === 1 ? '' : 's'}</span>` : ''}
  </div>
  <nav><a href="#health">Health</a><a href="#house">The house</a><a href="#stories">Item stories</a><a href="#said">What was said</a><a href="#structure">How the data is structured</a></nav>
</header>

<section id="health"><h2>Health checks</h2>
<p class="hint">Things in the data a person would find confusing or wrong. Warnings are worth fixing; notes are worth knowing.</p>
${warnings.length || notes.length ? '' : '<p class="okline">✓ Nothing to flag.</p>'}
<ul class="findings">${[...warnings, ...notes].map((h) => `<li class="${h.level}"><span class="lvl">${h.level === 'warning' ? '⚠' : 'ℹ'}</span><b>${esc(h.check)}.</b> ${esc(h.detail)}</li>`).join('')}</ul>
</section>

<section id="house"><h2>The house</h2>
<p class="hint">Every place and what's in it. An item's address is inherited from the places holding it. <span class="tag">position</span> is where a place sits among its neighbors; <span class="tag both">also an item</span> marks things that are both (a toolbox).</p>
${report.tree.length ? report.tree.map((n) => renderPlace(n, 0)).join('') : '<p class="hint">Nothing filed yet.</p>'}
${report.elsewhere.length ? `<details class="place" open><summary><span class="pname">Elsewhere</span> <span class="kind">outside the house tree</span></summary><ul class="items">${report.elsewhere.map(renderItem).join('')}</ul></details>` : ''}
</section>

<section id="stories"><h2>Item stories</h2>
<p class="hint">For each item: where it is now, and every placement, move, loan and container move — with the words that caused it.</p>
${report.stories.length ? report.stories.map((s) => `
<details class="story"><summary><b>${esc(s.name)}</b> <span class="now">— ${esc(s.now)}</span> <span class="count">${s.events.length} event${s.events.length === 1 ? '' : 's'}</span></summary>
<ol class="timeline">${s.events.map((e) => `<li><span class="when">${esc(fmtTime(e.at))}</span> ${esc(e.what)}${e.said ? `<blockquote>“${esc(e.said)}” <span class="iid">${esc(e.inboxId)}</span></blockquote>` : e.inboxId ? '' : '<span class="nosource"> (no utterance recorded)</span>'}</li>`).join('')}</ol>
</details>`).join('') : '<p class="hint">No items yet.</p>'}
</section>

<section id="said"><h2>What was said</h2>
<p class="hint">Layer 1: every utterance, word for word, with what the agent recorded and replied. The house above is built from these.</p>
${report.openQuestions.length ? `<h3>Open questions</h3><ul class="findings">${report.openQuestions.map((q) => `<li class="note"><span class="lvl">?</span><b>${esc(q.question)}</b> ${q.options.length ? `<span class="hint">(${esc(q.options.join(' / '))})</span>` : ''} <span class="iid">${esc(q.id)} · from ${esc(q.from)}</span></li>`).join('')}</ul>` : ''}
<details${report.inbox.length <= 15 ? ' open' : ''}><summary>${report.inbox.length} utterance${report.inbox.length === 1 ? '' : 's'}</summary>
<table class="inbox"><thead><tr><th>When</th><th>Said</th><th>Status</th><th>Agent replied</th></tr></thead><tbody>
${report.inbox.map((e) => `<tr><td class="when">${esc(fmtTime(e.at))}<br><span class="iid">${esc(e.id)}</span></td><td>“${esc(e.said)}”</td><td><span class="status s-${esc(e.status)}">${esc(e.status.replace(/_/g, ' '))}</span>${e.recorded ? `<br><span class="iid">${e.recorded} recorded</span>` : ''}</td><td>${esc(e.reply ?? '')}</td></tr>`).join('')}
</tbody></table></details>
</section>

<section id="structure"><h2>How the data is structured</h2>
<p class="hint">Two layers. <b>What was said</b> is captured first and never rewritten; an agent later files it into <b>the house</b>, and every change is logged in <b>history</b>. Arrows show which column points at which table.</p>
<pre class="diagram">${esc(DIAGRAM)}</pre>
${(['what was said', 'the house', 'history', 'bookkeeping'] as const).map((layer) => `
<h3>${esc(layer[0].toUpperCase() + layer.slice(1))}</h3>
${report.structure.filter((t) => t.layer === layer).map((t) => `
<details class="table"><summary><code>${esc(t.name)}</code> <span class="count">${t.rows} row${t.rows === 1 ? '' : 's'}</span> — ${esc(t.purpose)}</summary>
<table class="cols"><thead><tr><th>Column</th><th>Type</th><th>Meaning</th></tr></thead><tbody>
${t.columns.map((c) => `<tr><td><code>${esc(c.name)}</code></td><td>${esc(c.type)}</td><td>${esc(c.meaning)}${c.linksTo ? ` <span class="link">→ ${esc(c.linksTo)}</span>` : ''}</td></tr>`).join('')}
</tbody></table></details>`).join('')}`).join('')}
</section>
</main></body></html>`
}

function renderPlace(n: PlaceNode, depth: number): string {
  const tags = [
    `<span class="kind">${esc(n.kind)}</span>`,
    n.position ? `<span class="tag">${esc(n.position)}</span>` : '',
    n.isAlsoItem ? '<span class="tag both">also an item</span>' : '',
  ].join(' ')
  const inside = n.items.length + n.children.length
  return `<details class="place"${depth < 2 ? ' open' : ''}><summary><span class="pname">${esc(n.name)}</span> ${tags}${inside ? '' : ' <span class="empty">empty</span>'}</summary>
${n.description || n.aliases.length ? `<p class="desc">${esc(n.description ?? '')}${n.aliases.length ? ` <span class="aka">also called ${esc(n.aliases.join(', '))}</span>` : ''}</p>` : ''}
${n.items.length ? `<ul class="items">${n.items.map(renderItem).join('')}</ul>` : ''}
${n.children.map((c) => renderPlace(c, depth + 1)).join('')}
</details>`
}

function renderItem(it: ItemView): string {
  const extra = [
    it.quantity && it.quantity > 1 ? `×${it.quantity}` : '',
    it.status !== 'present' ? `${it.status}${it.lentTo ? ` to ${it.lentTo}` : ''}` : '',
    ...it.details,
    it.note ? `“${it.note}”` : '',
  ].filter(Boolean)
  return `<li><span class="iname">${esc(it.name)}</span>${extra.length ? ` <span class="extra">${esc(extra.join(' · '))}</span>` : ''}${it.aliases.length ? ` <span class="aka">aka ${esc(it.aliases.join(', '))}</span>` : ''}</li>`
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const DIAGRAM = `THE HOUSE
  locations   ──parent_id────►  locations     a place sits inside another place (room › shelving › shelf › tote)
  items       ──location_id──►  locations     an item sits in exactly one place; its address is inherited from there
  items       ──place_id─────►  locations     …and some items are also a place (a toolbox holds the wrenches)
  location_aliases, item_aliases, item_details  ──►  the place or item they describe
  relationships  ──subject / object──►  items  (charger part of laptop)

HISTORY  (append-only: every change, linked to the words that caused it)
  item_history      ──►  items;      from / to ──► locations;         inbox_id ──► inbox
  location_history  ──►  locations;  from / to parent ──► locations;  inbox_id ──► inbox

WHAT WAS SAID  (captured first, never rewritten)
  inbox                         every utterance, word for word, plus what the agent understood
  questions  ──inbox_ids──►  inbox`

const CSS = `
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1f;--muted:#6b6b70;--line:#e3e3e0;--accent:#2563eb;--warn:#b45309;--warn-bg:#fef3c7;--ok:#15803d;--ok-bg:#dcfce7;--tag:#eef2ff;--tag-fg:#3730a3;--both:#fce7f3;--both-fg:#9d174d;--code:#f4f4f2}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--accent:#60a5fa;--warn:#fbbf24;--warn-bg:#3a2a0b;--ok:#4ade80;--ok-bg:#14301f;--tag:#1e1b4b;--tag-fg:#c7d2fe;--both:#3b0d26;--both-fg:#f9a8d4;--code:#17171a}}
:root[data-theme="dark"]{--bg:#121214;--card:#1c1c1f;--fg:#ececee;--muted:#9a9aa2;--line:#2c2c31;--accent:#60a5fa;--warn:#fbbf24;--warn-bg:#3a2a0b;--ok:#4ade80;--ok-bg:#14301f;--tag:#1e1b4b;--tag-fg:#c7d2fe;--both:#3b0d26;--both-fg:#f9a8d4;--code:#17171a}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:20px 16px 80px}
h1{font-size:24px;margin:0}
h2{font-size:19px;margin:0 0 4px}
h3{font-size:15px;margin:18px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.sub,.hint{color:var(--muted);margin:2px 0 10px;font-size:14px}
.top{margin-bottom:18px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.chip{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:14px}
.chip.warn{background:var(--warn-bg);color:var(--warn);border-color:transparent}
.chip.ok{background:var(--ok-bg);color:var(--ok);border-color:transparent}
nav{display:flex;flex-wrap:wrap;gap:14px;font-size:14px}
nav a{color:var(--accent);text-decoration:none}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 16px}
.findings{list-style:none;padding:0;margin:0}
.findings li{padding:6px 10px;border-radius:8px;margin:4px 0}
.findings li.warning{background:var(--warn-bg)}
.findings .lvl{display:inline-block;width:1.4em}
.okline{color:var(--ok)}
details{margin:2px 0}
summary{cursor:pointer}
details.place{margin-left:0;padding-left:14px;border-left:2px solid var(--line)}
details.place>details.place{margin-left:6px}
.pname{font-weight:600}
.kind{font-size:12px;color:var(--muted)}
.tag{font-size:12px;background:var(--tag);color:var(--tag-fg);border-radius:6px;padding:0 6px}
.tag.both{background:var(--both);color:var(--both-fg)}
.empty{font-size:12px;color:var(--muted);font-style:italic}
.desc{margin:2px 0 2px 2px;font-size:13px;color:var(--muted)}
.aka{font-size:12px;color:var(--muted)}
ul.items{margin:2px 0 6px;padding-left:22px}
.iname{font-weight:500}
.extra{font-size:13px;color:var(--muted)}
.story{border-bottom:1px solid var(--line);padding:4px 0}
.now{color:var(--muted)}
.count{font-size:12px;color:var(--muted);margin-left:6px}
ol.timeline{margin:6px 0 8px;padding-left:22px}
ol.timeline li{margin:4px 0}
.when{font-size:12px;color:var(--muted);margin-right:6px;white-space:nowrap}
blockquote{margin:2px 0 0;padding:2px 10px;border-left:3px solid var(--accent);color:var(--fg);font-style:italic}
.iid{font-size:11px;color:var(--muted);font-style:normal;font-family:ui-monospace,Menlo,monospace}
.nosource{font-size:12px;color:var(--muted)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:5px 8px;border-bottom:1px solid var(--line)}
th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.status{font-size:12px;border-radius:6px;padding:0 6px;background:var(--code)}
.s-needs_clarification,.s-error{background:var(--warn-bg);color:var(--warn)}
.s-compacted{background:var(--ok-bg);color:var(--ok)}
code{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:var(--code);padding:0 4px;border-radius:4px}
.link{font-size:12px;color:var(--accent);white-space:nowrap}
pre.diagram{background:var(--code);border:1px solid var(--line);border-radius:8px;padding:10px;overflow-x:auto;font-size:12px;line-height:1.35}
details.table{border-bottom:1px solid var(--line);padding:4px 0}
@media (max-width:640px){th:nth-child(4),td:nth-child(4){display:none}}
`
