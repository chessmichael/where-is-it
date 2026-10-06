import { describe, expect, it } from 'vitest'
import { houseCheck } from '../db/check'
import { memoryDb } from './helpers'

// The living room bookcase from a real description: a top surface, a tall
// shelf on the left beside two short ones on the right, a split bottom shelf.
function bookcase() {
  const { db } = memoryDb()
  const part = (name: string, grid: { row: number; col: number; rows: number; cols: number }) => {
    const id = db.locations.ensurePath([{ name: 'Living room' }, { name: 'Bookcase', kind: 'furniture' }, { name, kind: 'shelf' }])
    db.locations.update(id, { grid })
    return id
  }
  const top = part('Top', { row: 1, col: 1, rows: 1, cols: 2 })
  const tall = part('Left tall shelf', { row: 2, col: 1, rows: 2, cols: 1 })
  const records = part('Records shelf', { row: 2, col: 2, rows: 1, cols: 1 })
  const audio = part('Speaker shelf', { row: 3, col: 2, rows: 1, cols: 1 })
  const bottomLeft = part('Bottom left', { row: 4, col: 1, rows: 1, cols: 1 })
  const bottomRight = part('Bottom right', { row: 4, col: 2, rows: 1, cols: 1 })
  for (const [name, at] of [['Turntable', top], ['Screen', tall], ['Record collection', records], ['Speaker', audio], ['Books', bottomLeft], ['Games', bottomRight]] as const)
    db.items.save(null, { name, location_id: at })
  return db
}

describe('layouts', () => {
  it('draws a bookcase from its parts’ cells, spans included', () => {
    const db = bookcase()
    const drawing = db.locations.drawing('living-room/bookcase')!
    expect(drawing).toBe(
      [
        'Bookcase (rows from the top, columns from the left)',
        '+-------------------------------------+',
        '| Top                                 |',
        '| Turntable                           |',
        '+------------------+------------------+',
        '| Left tall shelf  | Records shelf    |',
        '| Screen           | Record           |',
        '|                  | collection       |',
        '|                  +------------------+',
        '|                  | Speaker shelf    |',
        '|                  | Speaker          |',
        '+------------------+------------------+',
        '| Bottom left      | Bottom right     |',
        '| Books            | Games            |',
        '+------------------+------------------+',
      ].join('\n'),
    )
  })

  it('shows cells in the agents’ house map and lists parts without one', () => {
    const db = bookcase()
    expect(db.outline(false)).toContain('Left tall shelf [shelf, on, layout: row 2-3 from the top, column 1 from the left]')
    db.locations.ensurePath([{ name: 'Living room' }, { name: 'Bookcase' }, { name: 'Drawer' }])
    expect(db.locations.drawing('living-room/bookcase')).toContain('Not placed in the drawing yet: Drawer')
    expect(db.locations.drawing('living-room')).toBeNull() // no cells among its children
  })

  it('logs layout changes in location history and rejects nonsense cells', () => {
    const db = bookcase()
    db.locations.update('living-room/bookcase/records-shelf', { grid: { row: 3, col: 2, rows: 1, cols: 1 } }, null)
    const last = db.locations.history('living-room/bookcase/records-shelf').at(-1) as { from_position: string; to_position: string }
    expect([last.from_position, last.to_position]).toEqual(['row 2 from the top, column 2 from the left', 'row 3 from the top, column 2 from the left'])
    expect(() => db.locations.update('living-room/bookcase/top', { grid: { row: 0, col: 1, rows: 1, cols: 1 } })).toThrow(/grid.row/)
  })

  it('keeps a question’s diagram', () => {
    const { db } = memoryDb()
    const q = db.questions.ask({ conversation: 'c', inbox_ids: [], question: 'Is this right?', options: [], diagram: '+--+\n|A |\n+--+\n' })
    expect(db.questions.get(q.id)?.diagram).toBe('+--+\n|A |\n+--+')
  })
})

describe('house check', () => {
  const since = '2000-01-01'
  it('flags look-alike places with nothing telling them apart', () => {
    const { db } = memoryDb()
    db.locations.ensurePath([{ name: 'Basement' }, { name: 'Shelving unit', kind: 'furniture' }])
    const middle = db.locations.ensurePath([{ name: 'Basement' }, { name: 'Shelving unit 2', kind: 'furniture' }])
    db.locations.update(middle, { position: 'middle' })
    const [finding] = houseCheck(db, since)
    expect(finding).toMatch(/2 look-alike places in Basement/)
    expect(finding).toMatch(/“Shelving unit” \(basement\/shelving-unit\) has no position/)
    db.locations.update('basement/shelving-unit', { position: 'left' })
    expect(houseCheck(db, since)).toEqual([])
  })

  it('flags places named by their neighbor and "other" items, only when touched this run', () => {
    const { db } = memoryDb()
    const shelf = db.locations.ensurePath([{ name: 'Living room' }, { name: 'Bookcase', kind: 'furniture' }, { name: 'Shelf below upper right shelf', kind: 'shelf' }])
    db.items.save(null, { name: 'Other speaker', location_id: shelf })
    const findings = houseCheck(db, since)
    expect(findings).toHaveLength(2)
    expect(findings[0]).toMatch(/named by where it is relative to another place/)
    expect(findings[1]).toMatch(/“Other speaker”/)
    expect(houseCheck(db, '2999-01-01')).toEqual([])
  })

  it('leaves distinct places alone', () => {
    const { db } = memoryDb()
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Metal shelving', kind: 'furniture' }])
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Workbench', kind: 'furniture' }])
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Under the workbench', kind: 'area' }]) // an area, not a look-alike or a part
    expect(houseCheck(db, since)).toEqual([])
  })
})

describe('routing to a fast model', () => {
  it('keeps structural, long and answering turns on the strong model', async () => {
    const { needsStrongModel } = await import('../agent/route')
    const { db } = memoryDb()
    expect(needsStrongModel('the drill is in the garage', db, 'c')).toBe(false)
    expect(needsStrongModel("where's my passport", db, 'c')).toBe(false)
    expect(needsStrongModel('the photos box is on top of the stack now', db, 'c')).toBe(true)
    expect(needsStrongModel('the left one has the bike helmets', db, 'c')).toBe(true)
    expect(needsStrongModel('the power tools are in the garage', db, 'c')).toBe(false) // a group alone is fine…
    expect(needsStrongModel('all the baking stuff is in the cabinet', db, 'c')).toBe(true) // …"stuff"/"all the" isn't
    expect(needsStrongModel('word '.repeat(30), db, 'c')).toBe(true)
    db.questions.ask({ conversation: 'c', inbox_ids: [], question: 'Which drawer?', options: [] })
    expect(needsStrongModel('the top one', db, 'c')).toBe(true)
    expect(needsStrongModel('the passport is in the desk', db, 'other conversation')).toBe(false)
  })
})

describe('house check — look-alikes named by contents', () => {
  it('groups places by what they are, so content-named units still need positions', () => {
    const { db } = memoryDb()
    db.locations.ensurePath([{ name: 'Basement' }, { name: 'Holiday decorations shelving unit', kind: 'furniture' }])
    const canned = db.locations.ensurePath([{ name: 'Basement' }, { name: 'Canned goods shelving unit', kind: 'furniture' }])
    db.locations.update(canned, { position: 'middle' })
    expect(houseCheck(db, '2000-01-01')[0]).toMatch(/“Holiday decorations shelving unit”.*has no position/)
  })
  it('accepts names that say where they are, and leaves shelves alone', () => {
    const { db } = memoryDb()
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Left shelving unit', kind: 'furniture' }])
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Right shelving unit', kind: 'furniture' }])
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Workbench', kind: 'furniture' }, { name: 'Top shelf', kind: 'shelf' }])
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Workbench', kind: 'furniture' }, { name: 'Bottom shelf', kind: 'shelf' }])
    expect(houseCheck(db, '2000-01-01')).toEqual([])
  })
})

describe('container feedback (v7)', () => {
  it('flags a box filed as a plain item, but not one that is already a place', () => {
    const { db } = memoryDb()
    const closet = db.locations.ensurePath([{ name: 'Basement' }, { name: 'Closet' }])
    db.items.save(null, { name: 'Box of winter clothes', location_id: closet, category: 'container' })
    db.items.save(null, { name: 'Laptop bag', location_id: closet }) // a bag you carry, nothing said about contents
    const findings = houseCheck(db, '2000-01-01')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatch(/“Box of winter clothes”.*container filed as a plain item/)
  })

  it('tells tidy-up when it tries to reposition an item as if it were a place', async () => {
    const { compact } = await import('../agent/compact')
    const { ScriptedLLM } = await import('./helpers')
    const { db } = memoryDb()
    const e = db.inbox.add('c', 'the winter clothes box is on the bottom now')
    db.inbox.update(e.id, { status: 'pending_compaction' })
    const box = db.items.save(null, { name: 'Box of winter clothes', location_id: db.locations.ensurePath([{ name: 'Basement' }, { name: 'Closet' }]) })
    const llm = new ScriptedLLM([
      () => ({ calls: [{ name: 'update_location', input: { location_id: box, name: null, kind: null, preposition: null, description: null, position: 'bottom of the stack', grid: null, aliases: [], inbox_id: e.id } }] }),
      (req) => {
        const last = req.messages.at(-1)
        expect(last?.role === 'tool' && last.results[0].content).toMatch(/is an item .*not a place.*upsert_location/)
        return { calls: [{ name: 'finish', input: { compacted_inbox_ids: [], summary: 'stopped' } }] }
      },
      // The house check may flag the box on the first finish (it can count as touched this run); finishing again is accepted.
      () => ({ calls: [{ name: 'finish', input: { compacted_inbox_ids: [], summary: 'stopped' } }] }),
    ])
    await compact(llm, db, db.inbox.list('pending_compaction'))
  })
})

describe('stack tools (v8)', () => {
  async function tidy(db: ReturnType<typeof memoryDb>['db'], said: string, calls: { name: string; input: Record<string, unknown> }[]) {
    const { compact } = await import('../agent/compact')
    const { ScriptedLLM } = await import('./helpers')
    const e = db.inbox.add('c', said)
    db.inbox.update(e.id, { status: 'pending_compaction' })
    const results: string[] = []
    const llm = new ScriptedLLM([
      () => ({ calls: calls.map((c) => ({ ...c, input: { ...c.input, inbox_id: e.id } })) }),
      (req) => {
        const last = req.messages.at(-1)
        if (last?.role === 'tool') results.push(...last.results.map((r) => r.content))
        return { calls: [{ name: 'finish', input: { compacted_inbox_ids: [e.id], summary: 'done' } }] }
      },
      () => ({ calls: [{ name: 'finish', input: { compacted_inbox_ids: [e.id], summary: 'done' } }] }),
    ])
    await compact(llm, db, db.inbox.list('pending_compaction'))
    return results
  }
  const CLOSET = [{ name: 'Basement', kind: null, preposition: null }, { name: 'Closet', kind: 'storage', preposition: null }]
  const BOXES = [
    { name: 'Box of winter clothes', contents: ['winter clothes'] },
    { name: 'Box of books', contents: ['books'] },
    { name: 'Box of old photos', contents: ['old photos'] },
  ]

  it('files a stack: boxes as places, contents inside, every position set', async () => {
    const { db } = memoryDb()
    await tidy(db, 'stack of three boxes', [{ name: 'file_stack', input: { stack_path: CLOSET, boxes_top_to_bottom: BOXES } }])
    const box = (n: string) => db.locations.all().find((l) => l.name === n)!
    expect(box('Box of winter clothes').position).toBe('top of the stack')
    expect(box('Box of books').position).toBe('2nd from the top (middle of the stack)')
    expect(box('Box of old photos').position).toBe('bottom of the stack')
    expect(db.items.all().find((i) => i.name === 'books')?.location_id).toBe(box('Box of books').id)
    expect(db.items.all().some((i) => i.place_id === box('Box of books').id)).toBe(true) // the box can be asked for by name
  })

  it('reorders every box at once, contents staying put', async () => {
    const { db } = memoryDb()
    await tidy(db, 'stack of three boxes', [{ name: 'file_stack', input: { stack_path: CLOSET, boxes_top_to_bottom: BOXES } }])
    const id = (n: string) => db.locations.all().find((l) => l.name === n)!.id
    await tidy(db, 'flipped the stack', [{ name: 'reorder_stack', input: { box_ids_top_to_bottom: [id('Box of old photos'), id('Box of books'), id('Box of winter clothes')] } }])
    expect(db.locations.get(id('Box of old photos'))?.position).toBe('top of the stack')
    expect(db.locations.get(id('Box of winter clothes'))?.position).toBe('bottom of the stack')
    expect(db.items.all().find((i) => i.name === 'winter clothes')?.location_id).toBe(id('Box of winter clothes'))
  })

  it('refuses position-only names and partial reorders, saying why', async () => {
    const { db } = memoryDb()
    const r1 = await tidy(db, 'two boxes', [{ name: 'file_stack', input: { stack_path: CLOSET, boxes_top_to_bottom: [{ name: 'Top box', contents: ['a'] }, { name: 'Bottom box', contents: ['b'] }] } }])
    expect(r1[0]).toMatch(/name boxes by what they are/)
    await tidy(db, 'stack', [{ name: 'file_stack', input: { stack_path: CLOSET, boxes_top_to_bottom: BOXES } }])
    const id = (n: string) => db.locations.all().find((l) => l.name === n)!.id
    const r2 = await tidy(db, 'photos on top', [{ name: 'reorder_stack', input: { box_ids_top_to_bottom: [id('Box of old photos'), id('Box of books')] } }])
    expect(r2[0]).toMatch(/also has .*give every box/)
  })
})


describe('house check — no room (v13)', () => {
  it('flags furniture filed at the top level as if it were a room', () => {
    const { db } = memoryDb()
    db.locations.ensurePath([{ name: 'Nightstand' }])
    db.locations.ensurePath([{ name: 'Garage' }, { name: 'Workbench', kind: 'furniture' }])
    const findings = houseCheck(db, '2000-01-01')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatch(/“Nightstand”.*top level as if it were a room/)
  })
})
