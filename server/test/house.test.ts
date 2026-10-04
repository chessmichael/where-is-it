import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { compact } from '../agent/compact'
import { converse } from '../agent/converse'
import { emailAllowed, passwordMatches } from '../auth'
import { houseMarkdown, sqlDump } from '../db/export'
import { createProvider } from '../llm'
import { memoryDb, obs, ScriptedLLM } from './helpers'

describe('locations', () => {
  it('builds the room → storage → container hierarchy with readable ids, reusing existing nodes', () => {
    const { db } = memoryDb()
    const leaf = db.ensurePath([{ name: 'Garage' }, { name: 'metal shelving', kind: 'furniture' }, { name: 'top shelf', kind: 'shelf' }, { name: 'blue bin', kind: 'container' }])
    expect(leaf).toBe('garage/metal-shelving/top-shelf/blue-bin')
    expect(db.locationPath(leaf)).toBe('Garage › Metal shelving › Top shelf › Blue bin')
    expect(db.getLocation('garage')?.kind).toBe('room')
    expect(db.getLocation('garage/metal-shelving/top-shelf')?.preposition).toBe('on')

    db.updateLocation('garage/metal-shelving', { aliases: ['garage shelves'] })
    // Same place by different casing and by alias → no duplicates.
    expect(db.ensurePath([{ name: 'garage' }, { name: 'Garage shelves' }])).toBe('garage/metal-shelving')
    expect(db.locations()).toHaveLength(4)
  })

  it('merges duplicate locations, moving children and items', () => {
    const { db } = memoryDb()
    const a = db.ensurePath([{ name: 'Office' }, { name: 'Desk' }])
    const b = db.ensurePath([{ name: 'Office' }, { name: 'Writing desk' }, { name: 'Top drawer' }])
    const item = db.upsertItem({ item_id: null, name: 'Passport', location_id: b })
    db.mergeLocations(a, 'office/writing-desk')
    expect(db.getItem(item)?.location_id).toBe(b) // drawer itself survives, now under Desk
    expect(db.getLocation(b)?.parent_id).toBe(a)
    expect(db.locationAliases(a)).toContain('Writing desk')
  })
})

describe('items', () => {
  it('logs placement, moves, lending and return in item_history', () => {
    const { db } = memoryDb()
    const shelf = db.ensurePath([{ name: 'Garage' }, { name: 'Shelf' }])
    const closet = db.ensurePath([{ name: 'Hall closet' }, { name: 'Bottom shelf' }])
    const id = db.upsertItem({ item_id: null, name: 'Extension cords', location_id: shelf, inbox_id: 'in_1' })
    expect(id).toBe('extension-cords')
    db.upsertItem({ item_id: id, name: 'Extension cords', location_id: closet, inbox_id: 'in_2' })
    db.upsertItem({ item_id: id, name: 'Extension cords', status: 'lent', lent_to: 'Dave', inbox_id: 'in_3' })
    expect(db.getItem(id)).toMatchObject({ status: 'lent', lent_to: 'Dave', location_id: closet })
    db.upsertItem({ item_id: id, name: 'Extension cords', status: 'present', inbox_id: 'in_4' })
    expect(db.getItem(id)?.lent_to).toBeNull()
    expect(db.history(id).map((h) => h.event)).toEqual(['placed', 'moved', 'lent', 'returned'])
  })

  it('merges duplicate items, keeping details, aliases and relationships', () => {
    const { db } = memoryDb()
    const a = db.upsertItem({ item_id: null, name: 'Laptop charger', details: [{ key: 'wattage', value: '65W' }] })
    const b = db.upsertItem({ item_id: null, name: 'MacBook charger', details: [{ key: 'color', value: 'white' }] })
    const laptop = db.upsertItem({ item_id: null, name: 'Work laptop' })
    db.relate(b, 'part_of', laptop, null)
    db.mergeItems(a, b)
    expect(db.getItem(b)).toBeNull()
    expect(db.itemAliases(a)).toContain('MacBook charger')
    expect(db.itemDetails(a).map((d) => d.key).sort()).toEqual(['color', 'wattage'])
    expect(db.relationships()).toEqual([{ subject_item_id: a, relation: 'part_of', object_item_id: laptop, note: null }])
  })
})

describe('inbox and questions', () => {
  it('numbers entries per day and releases held entries when their question is answered', () => {
    const { db } = memoryDb()
    const e1 = db.addInbox('c1', 'my passport is in the drawer')
    const e2 = db.addInbox('c1', 'the top desk drawer')
    expect(e1.id).toMatch(/^in_\d{4}-\d{2}-\d{2}_0001$/)
    expect(e2.id).toMatch(/_0002$/)
    db.updateInbox(e1.id, { status: 'needs_clarification' })
    const q = db.addQuestion({ conversation: 'c1', inbox_ids: [e1.id], question: 'Which drawer?', options: [] })
    db.resolveQuestion(q.id, 'answered', 'office desk, top drawer', e2.id)
    expect(db.getInbox(e1.id)?.status).toBe('pending_compaction')
    expect(db.openQuestions()).toHaveLength(0)
  })

  it('search finds both filed items and not-yet-filed observations', () => {
    const { db } = memoryDb()
    db.upsertItem({ item_id: null, name: 'Christmas lights', location_id: db.ensurePath([{ name: 'Garage' }, { name: 'Red tote' }]) })
    const e = db.addInbox('c1', 'the passport is in the safe')
    db.updateInbox(e.id, { status: 'pending_compaction', observations: [obs({ item: 'passport', location: ['Bedroom', 'safe'] }) as never] })
    expect(db.search('christmas light').items[0]).toMatchObject({ name: 'Christmas lights', where: 'Garage › Red tote' })
    expect(db.search('passport').recent_unfiled[0]).toMatchObject({ inbox_id: e.id })
  })
})

describe('exports', () => {
  it('house.sql recreates the database in a stock SQLite', () => {
    const { db } = memoryDb()
    const drawer = db.ensurePath([{ name: 'Office' }, { name: 'Desk' }, { name: "Kid's drawer" }])
    db.upsertItem({ item_id: null, name: "Sam's passport", location_id: drawer, details: [{ key: 'expires', value: '2031' }] })
    db.addInbox('c1', "it's in the kid's drawer")

    const fresh = new DatabaseSync(':memory:')
    fresh.exec(sqlDump(db))
    expect(fresh.prepare('SELECT name, path FROM item_paths').all().map((r) => ({ ...r }))).toEqual([
      { name: "Sam's passport", path: "Office › Desk › Kid's drawer" },
    ])
    expect(fresh.prepare('SELECT said FROM inbox').get()).toMatchObject({ said: "it's in the kid's drawer" })
    expect(houseMarkdown(db)).toContain("Sam's passport (expires: 2031)")
  })
})

describe('conversation agent', () => {
  it('records observations and confirms', async () => {
    const { db } = memoryDb()
    const entry = db.addInbox('c1', 'the remote is on the coffee table in the living room')
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
    const entry = db.addInbox('c1', 'my passport is in the drawer')
    const llm = new ScriptedLLM([
      () => ({ calls: [{ name: 'ask_user', input: { question: 'Which drawer?', options: ['Office desk', 'Kitchen'] } }] }),
    ])
    const res = await converse(llm, db, entry)
    expect(res.reply).toBe('Which drawer?')
    expect(res.question?.options).toEqual(['Office desk', 'Kitchen'])
    expect(db.openQuestions()[0].inbox_ids).toEqual([entry.id])
    expect(llm.requests).toHaveLength(1)
  })

  it('reports tool errors back to the model instead of failing the turn', async () => {
    const { db } = memoryDb()
    const entry = db.addInbox('c1', "what's in the attic")
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
    const e1 = db.addInbox('c1', 'extension cords are in the blue bin on the top garage shelf')
    db.updateInbox(e1.id, { status: 'pending_compaction', observations: [obs({ item: 'extension cords', location: ['Garage', 'shelf', 'blue bin'] }) as never] })
    const e2 = db.addInbox('c1', 'something about the thing')
    db.updateInbox(e2.id, { status: 'pending_compaction', observations: [obs({ item: 'thing', confidence: 'low' }) as never] })

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
    const res = await compact(llm, db, db.listInbox({ status: 'pending_compaction' }))
    expect(res.compacted).toEqual([e1.id])
    expect(db.getInbox(e1.id)?.status).toBe('compacted')
    expect(db.getInbox(e2.id)?.status).toBe('needs_clarification')
    expect(db.search('extension cords').items[0].where).toBe('Garage › Shelf › Blue bin')
    expect(db.history('extension-cords')[0]).toMatchObject({ event: 'placed', inbox_id: e1.id })
  })

  it('leaves entries pending when the run ends without finish', async () => {
    const { db } = memoryDb()
    const e = db.addInbox('c1', 'keys on the hook')
    db.updateInbox(e.id, { status: 'pending_compaction' })
    const res = await compact(new ScriptedLLM([() => ({ text: 'done?' })]), db, db.listInbox({ status: 'pending_compaction' }))
    expect(res.compacted).toEqual([])
    expect(db.getInbox(e.id)?.status).toBe('pending_compaction')
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

  it('checks the access password and email allowlist', async () => {
    expect(await passwordMatches('open sesame', 'open sesame')).toBe(true)
    expect(await passwordMatches('open sesam', 'open sesame')).toBe(false)
    expect(await passwordMatches('', undefined)).toBe(false)
    expect(emailAllowed('A@x.com', '')).toBe(true)
    expect(emailAllowed('A@x.com', 'a@x.com, b@x.com')).toBe(true)
    expect(emailAllowed('c@x.com', 'a@x.com,b@x.com')).toBe(false)
  })
})
