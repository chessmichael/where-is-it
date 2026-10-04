// House inspector, locally. Builds the same page as the app's Inspect tab.
//
//   npm run inspect -- path/to/house.sql            a database downloaded from the app (Files → house.sql)
//   npm run inspect -- --eval v2 D06                one eval case's final database
//   npm run inspect -- --eval v2 --all              every case in a run (linked from cases.html)
//
// Writes <name>.inspect.html beside the input and, for a single page, opens it.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { inspectHouse } from '../server/db/inspect'
import { renderInspector } from '../server/db/inspect-html'
import { memoryDb } from '../server/test/helpers'

const EVAL_DIR = '.claude/hillclimb/capture'

/** Load a house.sql dump into a fresh in-memory house and render its inspector page. */
function pageFor(sqlFile: string, title: string, subtitle: string): string {
  const { db, raw } = memoryDb()
  // The dump re-creates tables with IF NOT EXISTS (already there) and inserts the rows,
  // including its own settings — clear the fresh database's first.
  raw.exec('DELETE FROM meta')
  raw.exec(readFileSync(sqlFile, 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, ''))
  db.migrate() // in case the dump predates newer columns
  return renderInspector(inspectHouse(db), { title, subtitle })
}

const args = process.argv.slice(2)
if (args[0] === '--eval') {
  const [, variant, which] = args
  if (!variant || !/^(baseline|v[1-9]\d*)$/.test(variant)) throw new Error('usage: --eval <baseline|vN> <case id | --all>')
  const dir = join(EVAL_DIR, variant, 'dbs')
  if (!existsSync(dir)) throw new Error(`no saved databases in ${dir} — runs from before this feature don't have them`)
  const cases = JSON.parse(readFileSync('evals/capture/cases.json', 'utf8')).cases as { id: string; said?: string; update?: string; question?: string }[]
  const ids = which === '--all' ? readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.slice(0, -4)) : [which]
  for (const id of ids) {
    const c = cases.find((x) => x.id === id)
    const out = join(dir, `${id}.inspect.html`)
    writeFileSync(out, pageFor(join(dir, `${id}.sql`), `Eval case ${id} — final database`, `${variant} · “${c?.update ?? c?.said ?? c?.question ?? ''}”`))
    if (ids.length === 1) {
      console.log(`wrote ${out}`)
      execFileSync('open', [out])
    }
  }
  if (ids.length > 1) console.log(`wrote ${ids.length} inspector pages in ${dir}`)
} else if (args[0]) {
  const out = args[0].replace(/\.sql$/, '') + '.inspect.html'
  writeFileSync(out, pageFor(args[0], 'House inspector', basename(args[0])))
  console.log(`wrote ${out}`)
  execFileSync('open', [out])
} else {
  console.error('usage: npm run inspect -- <house.sql> | --eval <variant> <case id | --all>')
  process.exit(2)
}
