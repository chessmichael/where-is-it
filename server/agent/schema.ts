// Small helpers for writing tool input schemas readably.
//
// Every tool uses "strict" schemas, which both Anthropic and OpenAI accept:
// objects list every property as required and allow nothing extra, and an
// optional field is written as nullable (the model sends null to skip it).

type Schema = Record<string, unknown>

export const text: Schema = { type: 'string' }
export const integer: Schema = { type: 'integer' }

export const textWith = (description: string): Schema => ({ type: 'string', description })

export const oneOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] })

export const listOf = (items: Schema, description?: string): Schema => ({
  type: 'array',
  items,
  ...(description ? { description } : {}),
})

/** The model may send this value, or null to mean "not applicable / leave unchanged". */
export const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: 'null' }] })

/** An object whose properties are all required and nothing else is allowed. */
export const object = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
  ...(description ? { description } : {}),
})

// ── reading tool inputs ──

/** A tool input field as a string, or null if the model sent null/nothing. */
export const textOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value))

/** A tool input field that should be an array of strings. */
export const textList = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
