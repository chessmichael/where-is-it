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
