// Checks the grader itself, for free (no model calls). For every case it
// builds (a) the correct outcome by hand — which must pass — and (b) an empty
// or wrong outcome — which must fail. If both don't hold, the grader (or the
// case) is broken and the eval's numbers can't be trusted.
//
//   npm run eval:selftest

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Observation } from '../../server/agent/observations'
import type { HouseDb } from '../../server/db/house'
import { memoryDb } from '../../server/test/helpers'
import { gradeDuplicateLookup, gradeItems, gradeReply, gradeShelving, gradeStack, itemHomes, seedHouse, type Case, type CaseFile } from './harness'

const file: CaseFile = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'cases.json'), 'utf8'))
const first = (alts: string) => alts.split('|')[0].replace(/\?$/, '')
const concretePath = (path: string[]) => path.filter((s) => !s.endsWith('?')).map(first)

function fresh(c: Case): { db: HouseDb; before: number } {
  const { db } = memoryDb()
  const seed = c.seed ? file.seed_houses[c.seed] : c.seed_inline
  if (seed) seedHouse(db, seed)
  return { db, before: db.locations.all().length }
}

function observation(item: string, location: string[] | null): Observation {
  return { kind: 'place', item, quantity: null, location, from_location: null, details: null, relation: null, related_item: null, person: null, corrects_inbox_id: null, answers_question_id: null, note: null, confidence: 'high' }
}

type Outcome = { oracle: number | null; wrong: number | null }

function itemsCase(c: Case): Outcome {
  // Oracle: put every expected item exactly where expected.
  const good = fresh(c)
  const obs: Observation[] = []
  for (const it of c.expect.items) {
    const path = it.path ? concretePath(it.path) : null
    good.db.items.save(null, {
      name: first(it.name),
      location_id: path ? good.db.locations.ensurePath(path.map((name: string) => ({ name }))) : null,
      quantity: it.quantity ?? null,
      status: it.status ?? null,
      lent_to: it.lent_to ?? null,
      details: it.details ? Object.entries(it.details).map(([key, value]) => ({ key, value: String(value) })) : null,
    })
    obs.push({ ...observation(first(it.name), path), kind: it.status === 'lent' ? 'lend' : 'place' })
  }
  const oracle = gradeItems(good.db, c.expect, obs, good.before).result().grade

  // Wrong: the same items, all dumped in one made-up place.
  const bad = fresh(c)
  const junk = bad.db.locations.ensurePath([{ name: 'Somewhere else' }])
  for (const it of c.expect.items) bad.db.items.save(null, { name: first(it.name), location_id: junk })
  const wrong = gradeItems(bad.db, c.expect, [], bad.before).result().grade
  if (oracle.observations !== 1) console.log(`  ${c.id}: oracle observations graded ${oracle.observations}`)
  return { oracle: oracle.database, wrong: wrong.database }
}

function shelvingCase(c: Case): Outcome {
  const e = c.expect
  const room = 'Garage'
  const build = (marked: boolean) => {
    const { db } = memoryDb()
    const unitOf = new Map<string, string>() // item → unit name
    const names = new Set<string>([...(e.units ?? []).map((u: any) => u.holding), ...(e.same_unit ?? []).flat(), ...(e.different_unit ?? []).flat()])
    let n = 0
    for (const u of e.units ?? []) unitOf.set(u.holding, marked ? `${first(u.position)} shelving unit` : 'Shelving unit')
    for (const [a, b] of e.same_unit ?? []) unitOf.set(b, unitOf.get(a) ?? unitOf.get(b) ?? `Unit ${++n}`)
    for (const name of names) if (!unitOf.has(name)) unitOf.set(name, marked ? `Unit ${++n}` : 'Shelving unit')
    for (const [name, unit] of unitOf) db.items.save(null, { name, location_id: db.locations.ensurePath([{ name: room }, { name: unit }, { name: 'Shelf' }]) })
    return db
  }
  return { oracle: gradeShelving(build(true), e).result().grade.database, wrong: gradeShelving(build(false), e).result().grade.database }
}

function stackCase(c: Case): Outcome {
  const order: string[] = c.expect.stack
  // Phrased the way agents actually write positions, including "Nth from the top".
  const words = order.length === 3 ? ['top of the stack', 'middle of the stack', 'bottom of the stack'] : order.length === 2 ? ['top of the stack', 'bottom of the stack'] : ['top of the stack', '2nd from the top', '3rd from the top', 'bottom of the stack']
  const build = (marked: boolean, swapContents: boolean) => {
    const { db } = memoryDb()
    const ids = order.map((name, i) => {
      // Boxes named after their contents and also filed as items — what the v2 agent does.
      const closet = db.locations.ensurePath([{ name: 'Closet' }])
      const box = db.locations.ensurePath([{ name: 'Closet' }, { name: `Box of ${name}` }])
      db.items.save(null, { name: `Box of ${name}`, location_id: closet, place_id: box })
      if (marked) db.locations.update(box, { position: words[i] })
      return db.items.save(null, { name, location_id: box })
    })
    const before = itemHomes(db)
    if (swapContents) {
      // Simulate the bug: contents shuffled between boxes instead of boxes moving.
      const boxes = ids.map((id) => db.items.get(id)!.location_id)
      ids.forEach((id, i) => db.items.save(id, { name: order[i], location_id: boxes[(i + 1) % boxes.length] }))
      return { db, before }
    }
    return { db, before }
  }
  const good = build(true, false)
  const unmarked = build(false, false)
  const swapped = build(true, true)
  const wrongA = gradeStack(unmarked.db, c.expect, unmarked.before).result().grade.database
  const wrongB = gradeStack(swapped.db, c.expect, swapped.before).result().grade.database
  return { oracle: gradeStack(good.db, c.expect, good.before).result().grade.database, wrong: Math.max(wrongA ?? 0, wrongB ?? 0) }
}

function replyCase(c: Case): Outcome {
  const right = (c.expect.answer_mentions as string[]).map(first).join(', ')
  return { oracle: gradeReply(`It's in the ${right}.`, c.expect).result().grade.reply, wrong: gradeReply('It’s out on the porch.', c.expect).result().grade.reply }
}

function duplicatesCase(c: Case): Outcome {
  if (c.mode === 'lookup') {
    const both = (c.expect.answer_mentions_each as string[][]).flat().map(first).join(' and the ')
    const after = (c.expect.after_answer_mentions as string[]).map(first).join(', ')
    const oracleBoth = gradeDuplicateLookup(`There are two: one in the ${both}.`, c.expect, false).result().grade.reply
    const oracleAsked = gradeDuplicateLookup(`That one is in the ${after}.`, c.expect, true).result().grade.reply
    const wrong = gradeDuplicateLookup('It’s out on the porch.', c.expect, false).result().grade.reply
    return { oracle: oracleBoth === 1 && oracleAsked === 1 ? 1 : 0, wrong }
  }
  // Change: the correct end state is exactly the expected items; the wrong one is the house left as it was.
  const good = memoryDb().db
  for (const it of c.expect.items) good.items.save(null, { name: first(it.name), location_id: good.locations.ensurePath(concretePath(it.path).map((name: string) => ({ name }))) })
  const untouched = fresh(c)
  const oracle = gradeItems(good, { ...c.expect, new_locations: undefined }, [], 0).result().grade.database
  const wrong = gradeItems(untouched.db, c.expect, [], untouched.before).result().grade.database
  return { oracle, wrong }
}

let bad = 0
for (const c of file.cases) {
  const outcome =
    c.set === 'duplicates' || c.set === 'positional' ? duplicatesCase(c) : c.set === 'shelving' ? shelvingCase(c) : c.set === 'stack' ? stackCase(c) : c.set === 'lookup' || c.set === 'journey' ? replyCase(c) : itemsCase(c)
  const ok = outcome.oracle === 1 && outcome.wrong === 0
  if (!ok) {
    bad++
    console.log(`✗ ${c.id} (${c.set}): correct outcome graded ${outcome.oracle}, wrong outcome graded ${outcome.wrong}`)
  }
}
console.log(bad ? `\n${bad} of ${file.cases.length} cases can't tell right from wrong` : `✓ all ${file.cases.length} cases: correct outcome passes, wrong outcome fails`)
process.exit(bad ? 1 : 0)
