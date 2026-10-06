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
