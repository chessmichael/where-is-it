// What the conversation agent extracts from one utterance and stores on its
// inbox entry (layer 1). Compaction later folds these into the relational
// tables (layer 2). Every field is present; "not applicable" is null, which
// keeps the schema valid for both Anthropic and OpenAI strict tool modes.

export const OBSERVATION_KINDS = [
  'place', // X is at L (first mention or restating)
  'move', // X went from A to B
  'remove', // gave away / threw out / used up
  'lend', // lent to someone (or returned: kind=place)
  'lost', // can't find it
  'describe_location', // a storage unit exists / what it's like / what's in it
  'detail', // an attribute of an item (color, brand, size, ...)
  'relate', // X goes with / is part of Y
  'correct', // fixes an earlier inbox entry
  'answer', // reply to a clarifying question
] as const
export type ObservationKind = (typeof OBSERVATION_KINDS)[number]

export const RELATIONS = ['part_of', 'goes_with', 'stored_with', 'replacement_for'] as const

export interface Observation {
  kind: ObservationKind
  item: string | null
  quantity: number | null
  location: string[] | null
  from_location: string[] | null
  details: { key: string; value: string }[] | null
  relation: (typeof RELATIONS)[number] | null
  related_item: string | null
  person: string | null
  corrects_inbox_id: string | null
  answers_question_id: string | null
  note: string | null
  confidence: 'high' | 'medium' | 'low'
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const path = {
  type: 'array',
  items: { type: 'string' },
  description: 'Outermost to innermost, starting with the room: ["Garage", "metal shelving", "top shelf", "blue bin"].',
}

export const OBSERVATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: [...OBSERVATION_KINDS] },
    item: { ...nullable({ type: 'string' }), description: 'Concise noun phrase as the person would say it.' },
    quantity: nullable({ type: 'integer' }),
    location: { ...nullable(path), description: 'Where the item is now / the storage unit being described.' },
    from_location: { ...nullable(path), description: 'For move: where it was.' },
    details: nullable({
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
      },
    }),
    relation: nullable({ type: 'string', enum: [...RELATIONS] }),
    related_item: nullable({ type: 'string' }),
    person: { ...nullable({ type: 'string' }), description: 'For lend: who has it.' },
    corrects_inbox_id: nullable({ type: 'string' }),
    answers_question_id: nullable({ type: 'string' }),
    note: { ...nullable({ type: 'string' }), description: 'Anything else worth keeping, verbatim-ish.' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: [
    'kind', 'item', 'quantity', 'location', 'from_location', 'details', 'relation',
    'related_item', 'person', 'corrects_inbox_id', 'answers_question_id', 'note', 'confidence',
  ],
}
