import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { compact } from '../agent/compact'
import { converse } from '../agent/converse'
import { passwordMatches } from '../auth'
import { houseMarkdown, sqlDump } from '../db/export'
import { createProvider } from '../llm'
import { memoryDb, obs, ScriptedLLM } from './helpers'

describe('locations', () => {
  it('builds the room → storage → container hierarchy with readable ids, reusing existing nodes', () => {
    const { db } = memoryDb()
    const leaf = db.locations.ensurePath([{ name: 'Garage' }, { name: 'metal shelving', kind: 'furniture' }, { name: 'top shelf', kind: 'shelf' }, { name: 'blue bin', kind: 'container' }])
    expect(leaf).toBe('garage/metal-shelving/top-shelf/blue-bin')
    expect(db.locations.path(leaf)).toBe('Garage › Metal shelving › Top shelf › Blue bin')
    expect(db.locations.get('garage')?.kind).toBe('room')
    expect(db.locations.get('garage/metal-shelving/top-shelf')?.preposition).toBe('on')

    db.locations.update('garage/metal-shelving', { aliases: ['garage shelves'] })
    // Same place by different casing and by alias → no duplicates.
    expect(db.locations.ensurePath([{ name: 'garage' }, { name: 'Garage shelves' }])).toBe('garage/metal-shelving')
    expect(db.locations.all()).toHaveLength(4)
  })

  it('merges duplicate locations, moving children and items', () => {
    const { db } = memoryDb()
    const a = db.locations.ensurePath([{ name: 'Office' }, { name: 'Desk' }])
    const b = db.locations.ensurePath([{ name: 'Office' }, { name: 'Writing desk' }, { name: 'Top drawer' }])
    const item = db.items.save(null, { name: 'Passport', location_id: b })
    db.locations.merge(a, 'office/writing-desk')
    expect(db.items.get(item)?.location_id).toBe(b) // drawer itself survives, now under Desk
    expect(db.locations.get(b)?.parent_id).toBe(a)
    expect(db.locations.aliases(a)).toContain('Writing desk')
  })
})

describe('items', () => {
  it('logs placement, moves, lending and return in item_history', () => {
    const { db } = memoryDb()
    const shelf = db.locations.ensurePath([{ name: 'Garage' }, { name: 'Shelf' }])
    const closet = db.locations.ensurePath([{ name: 'Hall closet' }, { name: 'Bottom shelf' }])
    const id = db.items.save(null, { name: 'Extension cords', location_id: shelf, inbox_id: 'in_1' })
    expect(id).toBe('extension-cords')
    db.items.save(id, { name: 'Extension cords', location_id: closet, inbox_id: 'in_2' })
    db.items.save(id, { name: 'Extension cords', status: 'lent', lent_to: 'Dave', inbox_id: 'in_3' })
    expect(db.items.get(id)).toMatchObject({ status: 'lent', lent_to: 'Dave', location_id: closet })
    db.items.save(id, { name: 'Extension cords', status: 'present', inbox_id: 'in_4' })
    expect(db.items.get(id)?.lent_to).toBeNull()
    expect(db.items.history(id).map((h) => h.event)).toEqual(['placed', 'moved', 'lent', 'returned'])
  })

  it('moving an item outside the house tree clears its old shelf', () => {
    const { db } = memoryDb()
    const shelf = db.locations.ensurePath([{ name: 'Garage' }, { name: 'Shelf' }])
    const id = db.items.save(null, { name: 'Cooler', location_id: shelf })
    db.items.save(id, { name: 'Cooler', location_note: "in Sam's car" })
    expect(db.items.get(id)).toMatchObject({ location_id: null, location_note: "in Sam's car" })
    expect(db.items.history(id).map((h) => h.event)).toEqual(['placed', 'moved'])
    db.items.save(id, { name: 'Cooler' }) // nothing changed → no history entry
    expect(db.items.history(id)).toHaveLength(2)
  })

  it('merges duplicate items, keeping details, aliases and relationships', () => {
    const { db } = memoryDb()
    const a = db.items.save(null, { name: 'Laptop charger', details: [{ key: 'wattage', value: '65W' }] })
    const b = db.items.save(null, { name: 'MacBook charger', details: [{ key: 'color', value: 'white' }] })
    const laptop = db.items.save(null, { name: 'Work laptop' })
    db.items.relate(b, 'part_of', laptop, null)
    db.items.merge(a, b)
    expect(db.items.get(b)).toBeNull()
    expect(db.items.aliases(a)).toContain('MacBook charger')
    expect(db.items.details(a).map((d) => d.key).sort()).toEqual(['color', 'wattage'])
    expect(db.items.relationships()).toEqual([{ subject_item_id: a, relation: 'part_of', object_item_id: laptop, note: null }])
  })
})

describe('inbox and questions', () => {
  it('numbers entries per day and releases held entries when their question is answered', () => {
    const { db } = memoryDb()
    const e1 = db.inbox.add('c1', 'my passport is in the drawer')
    const e2 = db.inbox.add('c1', 'the top desk drawer')
    expect(e1.id).toMatch(/^in_\d{4}-\d{2}-\d{2}_0001$/)
    expect(e2.id).toMatch(/_0002$/)
    db.inbox.update(e1.id, { status: 'needs_clarification' })
    const q = db.questions.ask({ conversation: 'c1', inbox_ids: [e1.id], question: 'Which drawer?', options: [] })
    db.questions.resolve(q.id, 'answered', 'office desk, top drawer', e2.id)
    expect(db.inbox.get(e1.id)?.status).toBe('pending_compaction')
    expect(db.questions.open()).toHaveLength(0)
  })

  it('search finds both filed items and not-yet-filed observations', () => {
    const { db } = memoryDb()
    db.items.save(null, { name: 'Christmas lights', location_id: db.locations.ensurePath([{ name: 'Garage' }, { name: 'Red tote' }]) })
    const e = db.inbox.add('c1', 'the passport is in the safe')
    db.inbox.update(e.id, { status: 'pending_compaction', observations: [obs({ item: 'passport', location: ['Bedroom', 'safe'] }) as never] })
    expect(db.search('christmas light').items[0]).toMatchObject({ name: 'Christmas lights', where: 'Garage › Red tote' })
    expect(db.search('passport').recent_unfiled[0]).toMatchObject({ inbox_id: e.id })
  })
})

describe('exports', () => {
  it('house.sql recreates the database in a stock SQLite', () => {
    const { db } = memoryDb()
    const drawer = db.locations.ensurePath([{ name: 'Office' }, { name: 'Desk' }, { name: "Kid's drawer" }])
    db.items.save(null, { name: "Sam's passport", location_id: drawer, details: [{ key: 'expires', value: '2031' }] })
    db.inbox.add('c1', "it's in the kid's drawer")

    const fresh = new DatabaseSync(':memory:')
    fresh.exec(sqlDump(db))
    expect(fresh.prepare('SELECT name, path FROM item_paths').all().map((r) => ({ ...r }))).toEqual([
      { name: "Sam's passport", path: "Office › Desk › Kid's drawer" },
    ])
    expect(fresh.prepare('SELECT said FROM inbox').get()).toMatchObject({ said: "it's in the kid's drawer" })
    expect(houseMarkdown(db)).toContain("Sam's passport (expires: 2031)")
    // Running it again on the same database replaces rather than collides.
    fresh.exec(sqlDump(db))
    expect(fresh.prepare('SELECT COUNT(*) AS n FROM items').get()).toMatchObject({ n: 1 })
  })
})

describe('conversation agent', () => {
  it('records observations and confirms', async () => {
    const { db } = memoryDb()
    const entry = db.inbox.add('c1', 'the remote is on the coffee table in the living room')
    const llm = new ScriptedLLM([
      () => ({ calls: [{ name: 'record_observations', input: { observations: [obs({ item: 'TV remote', location: ['Living room', 'coffee table'] })] } }] }),
      () => ({ text: 'Got it — remote, coffee table.' }),
    ])
    const res = await converse(llm, db, entry)
    expect(res.reply).toBe('Got it — remote, coffee table.')
    expect(res.observations[0]).toMatchObject({ item: 'TV remote' })
    // The utterance and its id reach the model; the system prompt is static.
    expect(JSON.stringify(llm.requests[0].messages)).toContain(entry.id)
    expect(llm.requests[0].system).not.toContain(entry.id)
  })

  it('ask_user ends the turn and stores an open question', async () => {
    const { db } = memoryDb()
    const entry = db.inbox.add('c1', 'my passport is in the drawer')
    const llm = new ScriptedLLM([
      () => ({ calls: [{ name: 'ask_user', input: { question: 'Which drawer?', options: ['Office desk', 'Kitchen'] } }] }),
    ])
    const res = await converse(llm, db, entry)
    expect(res.reply).toBe('Which drawer?')
    expect(res.question?.options).toEqual(['Office desk', 'Kitchen'])
    expect(db.questions.open()[0].inbox_ids).toEqual([entry.id])
    expect(llm.requests).toHaveLength(1)
  })

  it('reports tool errors back to the model instead of failing the turn', async () => {
    const { db } = memoryDb()
    const entry = db.inbox.add('c1', "what's in the attic")
    const llm = new ScriptedLLM([
      () => ({ calls: [{ name: 'get_location', input: { location: 'attic' } }] }),
      (req) => {
        const last = req.messages.at(-1)
        expect(last?.role === 'tool' && last.results[0].isError).toBe(true)
        return { text: "I don't have an attic recorded yet." }
      },
    ])
    expect((await converse(llm, db, entry)).reply).toBe("I don't have an attic recorded yet.")
  })
})

describe('compaction agent', () => {
  it('files pending observations into the relational model and marks them compacted', async () => {
    const { db } = memoryDb()
    const e1 = db.inbox.add('c1', 'extension cords are in the blue bin on the top garage shelf')
    db.inbox.update(e1.id, { status: 'pending_compaction', observations: [obs({ item: 'extension cords', location: ['Garage', 'shelf', 'blue bin'] }) as never] })
    const e2 = db.inbox.add('c1', 'something about the thing')
    db.inbox.update(e2.id, { status: 'pending_compaction', observations: [obs({ item: 'thing', confidence: 'low' }) as never] })

    const path = [
      { name: 'Garage', kind: null, preposition: null },
      { name: 'Shelf', kind: 'shelf', preposition: 'on' },
      { name: 'Blue bin', kind: 'container', preposition: 'in' },
    ]
    const llm = new ScriptedLLM([
      () => ({
        calls: [
          {
            name: 'upsert_item',
            input: {
              item_id: null, name: 'Extension cords', category: 'electrical', description: null, quantity: null,
              location_path: path, location_id: null, location_note: null, status: null, lent_to: null,
              aliases: [], details: [], inbox_id: e1.id,
            },
          },
          { name: 'ask_user', input: { question: 'What was "the thing"?', options: [], inbox_ids: [e2.id] } },
        ],
      }),
      () => ({ calls: [{ name: 'finish', input: { compacted_inbox_ids: [e1.id, 'in_bogus'], summary: 'Filed the cords.' } }] }),
    ])
    const res = await compact(llm, db, db.inbox.list('pending_compaction'))
    expect(res.compacted).toEqual([e1.id])
    expect(db.inbox.get(e1.id)?.status).toBe('compacted')
    expect(db.inbox.get(e2.id)?.status).toBe('needs_clarification')
    expect(db.search('extension cords').items[0].where).toBe('Garage › Shelf › Blue bin')
    expect(db.items.history('extension-cords')[0]).toMatchObject({ event: 'placed', inbox_id: e1.id })
  })

  it('leaves entries pending when the run ends without finish', async () => {
    const { db } = memoryDb()
    const e = db.inbox.add('c1', 'keys on the hook')
    db.inbox.update(e.id, { status: 'pending_compaction' })
    const res = await compact(new ScriptedLLM([() => ({ text: 'done?' })]), db, db.inbox.list('pending_compaction'))
    expect(res.compacted).toEqual([])
    expect(db.inbox.get(e.id)?.status).toBe('pending_compaction')
  })
})

describe('configuration', () => {
  it('selects the provider from env without code changes', () => {
    expect(createProvider({ OPENAI_API_KEY: 'k' })).toMatchObject({ provider: 'openai', model: 'gpt-5.5' })
    expect(createProvider({ ANTHROPIC_API_KEY: 'k' })).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5' })
    expect(createProvider({ LLM_PROVIDER: 'openai', LLM_MODEL: 'llama3.3', LLM_BASE_URL: 'http://localhost:11434/v1' })).toMatchObject({ model: 'llama3.3' })
    expect(() => createProvider({ LLM_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/)
    expect(() => createProvider({ LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k' })).toThrow(/Unknown LLM_PROVIDER/)
  })

  it('checks the access password', async () => {
    expect(await passwordMatches('open sesame', 'open sesame')).toBe(true)
    expect(await passwordMatches('open sesam', 'open sesame')).toBe(false)
    expect(await passwordMatches('', undefined)).toBe(false)
  })
})

describe('traces', () => {
  it('stores one row per turn and serves a conversation as one file', async () => {
    const { appendConversationTrace, getTrace, listTraces, writeCompactionTrace } = await import('../trace')
    const { db } = memoryDb()
    appendConversationTrace(db, 'c_1', { provider: 'openai', model: 'gpt-5.5' }, { said: 'one' })
    appendConversationTrace(db, 'c_1', { provider: 'openai', model: 'gpt-5.5' }, { said: 'two' })
    const run = writeCompactionTrace(db, { kind: 'compaction', compacted: [] })
    const doc = JSON.parse(getTrace(db, 'c_1.json')!)
    expect(doc).toMatchObject({ conversation: 'c_1', model: 'gpt-5.5', turns: [{ said: 'one' }, { said: 'two' }] })
    expect(JSON.parse(getTrace(db, run)!)).toMatchObject({ kind: 'compaction' })
    expect(listTraces(db).map((t) => t.name).sort()).toEqual(['c_1.json', run].sort())
    expect(getTrace(db, '../etc/passwd')).toBeNull()
    expect(sqlDump(db)).not.toContain('CREATE TABLE IF NOT EXISTS traces')
  })
})

describe('positions, moving places, and things that are also places (schema v2)', () => {
  it('moving a place moves everything in it, and is logged', () => {
    const { db } = memoryDb()
    const tote = db.locations.ensurePath([{ name: 'Garage' }, { name: 'Shelf' }, { name: 'Red tote', kind: 'container' }])
    const lights = db.items.save(null, { name: 'Holiday lights', location_id: tote })
    const attic = db.locations.ensurePath([{ name: 'Attic' }])
    db.locations.move(tote, attic, 'by the window', 'in_1')
    expect(db.locations.path(db.items.get(lights)!.location_id)).toBe('Attic › Red tote')
    expect(db.describeItem(db.items.get(lights)!).where).toBe('Attic › Red tote (by the window)')
    expect(db.locations.history(tote)).toMatchObject([{ event: 'moved', from_parent_id: 'garage/shelf', to_parent_id: 'attic', to_position: 'by the window', inbox_id: 'in_1' }])
    expect(() => db.locations.move(attic, tote)).toThrow(/inside itself/) // the attic now holds the tote
  })

  it('repositioning is logged, and the stack reads in order', () => {
    const { db } = memoryDb()
    const box = db.locations.ensurePath([{ name: 'Closet' }, { name: 'Box of books', kind: 'container' }])
    db.locations.update(box, { position: 'top of the stack' })
    db.locations.update(box, { position: 'bottom of the stack' }, 'in_2')
    expect(db.locations.get(box)?.position).toBe('bottom of the stack')
    expect(db.locations.history(box).map((h: any) => [h.from_position, h.to_position])).toEqual([[null, 'top of the stack'], ['top of the stack', 'bottom of the stack']])
  })

  it('an item that is also a place stays in sync when either moves', () => {
    const { db } = memoryDb()
    const bench = db.locations.ensurePath([{ name: 'Garage' }, { name: 'Workbench' }])
    const toolboxPlace = db.locations.ensurePath([{ name: 'Garage' }, { name: 'Workbench' }, { name: 'Toolbox', kind: 'container' }])
    const wrench = db.items.save(null, { name: 'Wrench', location_id: toolboxPlace })
    const toolbox = db.items.save(null, { name: 'Toolbox', location_id: bench, place_id: toolboxPlace })
    // Move the item → the place (and the wrench) follow.
    const shed = db.locations.ensurePath([{ name: 'Shed' }])
    db.items.save(toolbox, { name: 'Toolbox', location_id: shed })
    expect(db.locations.path(db.items.get(wrench)!.location_id)).toBe('Shed › Toolbox')
    // Move the place → the item follows.
    db.locations.move(toolboxPlace, bench)
    expect(db.items.get(toolbox)!.location_id).toBe(bench)
  })

  it('upgrades a database created before positions and place links existed', () => {
    const { raw, db } = memoryDb()
    // Recreate the exact v1 tables (no position, no place_id, no location_history).
    raw.exec(`PRAGMA foreign_keys = OFF;
      DROP VIEW item_paths; DROP VIEW location_paths; DROP TABLE location_history; DROP TABLE locations; DROP TABLE items;
      CREATE TABLE locations (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, parent_id TEXT REFERENCES locations(id),
        preposition TEXT NOT NULL DEFAULT 'in', description TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE items (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT, description TEXT, quantity INTEGER,
        location_id TEXT REFERENCES locations(id), location_note TEXT, status TEXT NOT NULL DEFAULT 'present', lent_to TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`)
    raw.exec(`INSERT INTO locations VALUES ('garage', 'Garage', 'room', NULL, 'in', NULL, 'x', 'x')`)
    expect(raw.prepare(`SELECT name FROM pragma_table_info('locations')`).all().map((r: any) => r.name)).not.toContain('position')
    db.migrate()
    const cols = (t: string) => raw.prepare(`SELECT name FROM pragma_table_info('${t}')`).all().map((r: any) => r.name)
    expect(cols('locations')).toContain('position')
    expect(cols('items')).toContain('place_id')
    db.locations.update('garage', { position: 'behind the house' })
    expect(db.locations.describedPath('garage')).toBe('Garage (behind the house)')
  })
})

describe('house inspector', () => {
  it('explains the structure, tells each item\'s story, and flags confusing data', async () => {
    const { inspectHouse } = await import('../db/inspect')
    const { renderInspector } = await import('../db/inspect-html')
    const { db } = memoryDb()
    const said = db.inbox.add('c', 'the holiday lights are in the red tote in the garage')
    const tote = db.locations.ensurePath([{ name: 'Garage' }, { name: 'Red tote', kind: 'container' }])
    db.items.save(null, { name: 'Holiday lights', location_id: tote, inbox_id: said.id })
    const moved = db.inbox.add('c', 'I moved the red tote to the attic')
    db.locations.move(tote, db.locations.ensurePath([{ name: 'Attic' }]), null, moved.id)
    for (const name of ['Top box', 'Box of books']) {
      db.locations.update(db.locations.ensurePath([{ name: 'Closet' }, { name, kind: 'container' }]), { position: 'top of the stack' })
    }
    const report = inspectHouse(db)
    expect(report.structure.find((t) => t.name === 'items')?.columns.find((c) => c.name === 'location_id')?.linksTo).toBe('locations.id')
    const story = report.stories.find((s) => s.name === 'Holiday lights')!
    expect(story.events.map((e) => e.said)).toEqual([said.said, moved.said])
    expect(story.now).toBe('Attic › Red tote')
    const checks = report.health.map((h) => h.check)
    expect(checks).toContain('Named by position') // "Top box"
    expect(checks).toContain('Same position twice') // two boxes on top
    const html = renderInspector(report, { title: '<script>x</script>' })
    expect(html).not.toContain('<script>x')
    expect(html).toContain('&lt;script&gt;x')
  })
})

describe('database guide', () => {
  it('generates for an empty house, and every query in it runs against the export', async () => {
    const { sqlGuide } = await import('../db/sql-guide')
    const { db: empty } = memoryDb()
    expect(sqlGuide(empty)).toContain('# Your house database')

    const { db } = memoryDb()
    const tote = db.locations.ensurePath([{ name: 'Garage' }, { name: 'Red tote', kind: 'container' }])
    db.items.save(null, { name: "Kid's holiday lights", location_id: tote, details: [{ key: 'color', value: 'red' }] })
    const guide = sqlGuide(db)
    const loaded = new DatabaseSync(':memory:')
    loaded.exec(sqlDump(db))
    const queries = [...guide.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1])
    expect(queries.length).toBeGreaterThan(10)
    for (const sql of queries) expect(() => loaded.prepare(sql).all()).not.toThrow()
  })
})
