import { describe, expect, it } from 'vitest'
import { compact } from '../agent/compact'
import { entriesForPlace, planRedo } from '../agent/redo'
import { memoryDb, ScriptedLLM } from './helpers'

// A small house filed from two utterances: a bookcase and a garage shelf.
function house() {
  const { db } = memoryDb()
  const book = db.inbox.add('c', 'the records are on the shelf below the upper right shelf of the bookcase')
  const garage = db.inbox.add('c', 'the drill is in the garage')
  const shelf = db.locations.ensurePath([{ name: 'Living room' }, { name: 'Bookcase', kind: 'furniture' }, { name: 'Shelf below upper right shelf', kind: 'shelf' }])
  db.items.save(null, { name: 'Record collection', location_id: shelf, inbox_id: book.id })
  db.items.save(null, { name: 'Drill', location_id: db.locations.ensurePath([{ name: 'Garage' }]), inbox_id: garage.id })
  for (const e of [book, garage]) db.inbox.update(e.id, { status: 'compacted' })
  return { db, book, garage }
}

describe('redo from what was said', () => {
  it('finds the utterances behind a place and everything inside it', () => {
    const { db, book } = house()
    expect(entriesForPlace(db, 'living-room/bookcase').map((e) => e.id)).toEqual([book.id])
    expect(entriesForPlace(db, 'living-room').map((e) => e.id)).toEqual([book.id])
  })

  it('redoing a place saves a copy and queues only its utterances, with the redo instructions', async () => {
    const { db, book, garage } = house()
    const plan = planRedo(db, 'living-room/bookcase')
    expect(plan.entries).toBe(1)
    expect(plan.snapshot.label).toBe('Before redoing Living room › Bookcase')
    expect(db.inbox.get(book.id)?.status).toBe('pending_compaction')
    expect(db.inbox.get(garage.id)?.status).toBe('compacted')

    // Tidy-up is told it's a redo, renames the shelf in place and sets its layout cell.
    const llm = new ScriptedLLM([
      (req) => {
        const first = req.messages[0]
        expect(first.role === 'user' && first.content).toContain('<redo scope="Living room › Bookcase">')
        return {
          calls: [
            { name: 'update_location', input: { location_id: 'living-room/bookcase/shelf-below-upper-right-shelf', name: 'Records shelf', kind: null, preposition: null, description: null, position: null, grid: { row: 2, col: 2, rows: 1, cols: 1 }, aliases: [], inbox_id: book.id } },
          ],
        }
      },
      () => ({ calls: [{ name: 'finish', input: { compacted_inbox_ids: [book.id], summary: 'renamed' } }] }),
    ])
    await compact(llm, db, db.inbox.list('pending_compaction'))
    expect(db.locations.get('living-room/bookcase/shelf-below-upper-right-shelf')?.name).toBe('Records shelf')
    expect(db.locations.drawing('living-room/bookcase')).toContain('Records shelf')

    // Undo: everything is back as it was, names, layout and statuses included.
    db.snapshots.restore(plan.snapshot.id)
    expect(db.locations.get('living-room/bookcase/shelf-below-upper-right-shelf')?.name).toBe('Shelf below upper right shelf')
    expect(db.locations.get('living-room/bookcase/shelf-below-upper-right-shelf')?.grid).toBeNull()
    expect(db.inbox.get(book.id)?.status).toBe('compacted')
    expect(db.items.all().map((i) => i.name).sort()).toEqual(['Drill', 'Record collection'])
  })

  it('redoing the whole house clears it and queues every utterance; restore brings it all back', () => {
    const { db } = house()
    const before = { items: db.items.all().length, places: db.locations.all().length, history: db.sql.all('SELECT * FROM item_history').length }
    const plan = planRedo(db, null)
    expect(plan.entries).toBe(2)
    expect(db.items.all()).toHaveLength(0)
    expect(db.inbox.list('pending_compaction')).toHaveLength(2)
    db.snapshots.restore(plan.snapshot.id)
    expect({ items: db.items.all().length, places: db.locations.all().length, history: db.sql.all('SELECT * FROM item_history').length }).toEqual(before)
    expect(db.inbox.list('pending_compaction')).toHaveLength(0)
  })

  it('keeps at most ten saved copies, newest first', () => {
    const { db } = house()
    for (let i = 0; i < 12; i++) db.snapshots.take(`copy ${i}`)
    const list = db.snapshots.list()
    expect(list).toHaveLength(10)
    expect(list[0].label).toBe('copy 11')
  })

  it('refuses a place nothing was said about', () => {
    const { db } = house()
    db.locations.ensurePath([{ name: 'Attic' }])
    expect(() => planRedo(db, 'attic')).toThrow(/nothing you said/)
  })
})
